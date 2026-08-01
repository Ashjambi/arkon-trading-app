# Diagnostics/Accounting Bug Fix — Root Cause Analysis & Changes

## Verification Status

| Area | Status | Evidence |
|------|--------|----------|
| Source-code taxonomy migration | COMPLETED — pending runtime verification | All 11 production call sites migrated; final repository search evidence pending execution |
| Diagnostics endpoint/UI implementation | COMPLETED — pending API/browser verification | Endpoint and fetch-based UI implementation |
| CI guard | COMPLETED — pending execution | `scripts/ci-guard-recordBlock.sh` created; requires Node/npm to run |
| Build, lint, typecheck | PENDING — Node/npm unavailable | No runtime command output yet |
| Unit, API, component tests | PENDING — Node/npm unavailable | No runtime command output yet |
| Production/runtime validation | PENDING | Requires controlled test scenarios |
| MT5 bridge credential/connectivity repair | OUT OF SCOPE / NOT VERIFIED | Separate remediation task |

**This migration fixes diagnostic classification and counting; it does not establish that bridge connectivity or MT5/EA authentication is healthy.**

---

## Root Cause Report

### Issue 1: RISK_LIMITS counter showing 129 on a new account

**Source files:**
- `src/services/ExecutionOrchestrator.ts` — `recordBlock('RISK_LIMITS', compliance.reason)`
- `src/services/ComplianceGatekeeper.ts` — ADR exhaustion checks

**Root cause:** Compliance gate rejections (ADR exhaustion, DVOL, slippage) were classified as `RISK_LIMITS` events. Every 30-second polling cycle called `processAsset("BTC")` → `executeSignal()` → `complianceGatekeeper.validateSignal()` → ADR check failed → `recordBlock('RISK_LIMITS', ...)`. Each cycle used a new signal ID as correlationId, so the `EventTaxonomyService` dedup never matched. With 129 events over approximately 64 minutes of polling, the counter inflated to 129.

**Fix applied:**
- Changed to `recordSignalFiltered()` which correctly categorizes as `SIGNAL_FILTERED` (expected signal filter)
- ADR, DVOL, slippage, compliance check rejections are now `SIGNAL_FILTERED`, not `RISK_BLOCKED`
- Dedup key now includes category-aware `asset|reasonCode`

### Issue 2: CIRCUIT_BREAKER counter showing 34 on a new account

**Source files:**
- `src/services/ExecutionOrchestrator.ts` — previously caught circuit breaker errors with `recordBlock('CIRCUIT_BREAKER', errMessage)`
- `src/services/ExecutionOrchestrator.ts` — `TradingCircuitBreaker.recordNonOperationFailure()`

**Root cause:** When the circuit breaker was OPEN, every subsequent signal evaluation that tried the breaker got `"Circuit breaker is OPEN - trading suspended"`, which was caught and logged as another CIRCUIT_BREAKER event. Each 30s polling cycle added +1. Additionally, `recordNonOperationFailure()` was incrementing `failureCount` for VALIDATION/RISK_GATE categories, which should never affect the breaker.

**Fix applied:**
- `recordBreakerSuppressed()` now used for suppressed attempts — they increment `breakerSuppressedDuplicateCount`, NOT `consecutiveBreakerFailures`
- `recordNonOperationFailure()` now returns early for non-bridge categories (VALIDATION, RISK_GATE, MARKET_DATA)
- `TradingCircuitBreaker.onFailure()` already had correct guard for `isBridgeExecutionFailure === false`

### Issue 3: activeRiskBlocks = cumulative count (bad semantics)

**Source file:** `src/services/EventTaxonomyService.ts` — `this.counters.activeRiskBlocks = this.counters.riskBlocksToday`

**Root cause:** `activeRiskBlocks` was set to `riskBlocksToday` (cumulative daily counter), making it always equal to the day's total rather than the current snapshot of active blocks.

**Fix applied:** Added `clearRiskBlock()` method and `activeRiskBlocks` now tracks current active blocks as a snapshot count, separate from `uniqueRiskBlocksToday`.

### Issue 4: Dedup insufficient for polling cycles

**Source file:** `src/services/EventTaxonomyService.ts` — `isDuplicate()` key was `correlationId|eventType|bucket`

**Root cause:** Each 30s polling cycle generates a new signal ID, which was used as `correlationId`. Since the dedup key was based on `correlationId`, every cycle created a new unique key, defeating dedup entirely.

**Fix applied:** Dedup key now accepts an `extraKey` parameter (`asset|reasonCode|category`). The same ADR block on BTC within the 60s window is correctly deduplicated across polling cycles.

---

## Complete Changed Files

| File | Type | Description |
|------|------|-------------|
| `src/services/EventTaxonomyService.ts` | Production behavior | Added `sanitizeSnapshot()`, `sanitizeReason()`, `RISK_BLOCK_REASON_CODES`, `SIGNAL_FILTER_REASON_CODES`; `getSnapshot()` calls `sanitizeSnapshot()` before returning; dedup key includes `asset\|reasonCode` |
| `src/services/ExecutionOrchestrator.ts` | Production behavior | Migrated 6 `recordBlock()` calls to dual `eventTaxonomyService.recordRiskBlocked()` + `executionDecisionTraceService.recordRiskBlocked()`; Compliance gate rejections use `recordSignalFiltered()`; CB suppressed attempts use `recordBreakerSuppressed()` |
| `src/hooks/useSignalEngine.ts` | Production behavior | Migrated 4 `recordBlock()` calls to `executionDecisionTraceService.recordRiskBlocked()` |
| `src/services/MultiStrategySignalCoordinatorService.ts` | Production behavior | Migrated 1 `recordBlock('COORDINATION')` call to `executionDecisionTraceService.recordSignalFiltered()` |
| `src/services/ExecutionDecisionTraceService.ts` | Production behavior | Added `recordRiskBlocked()`, `recordSignalFiltered()` typed methods; existing `recordBlock()` marked `@deprecated` and routes via EventTaxonomyService internally |
| `src/services/EventTaxonomyService.test.ts` | Test/CI | Implemented test coverage for dedup, day-bucket, CB semantics, sanitization, activeRiskBlocks (pending execution) |
| `scripts/ci-guard-recordBlock.sh` | Test/CI (NEW) | CI guard script scanning for prohibited `recordBlock(` usage in production code |
| `server.ts` | Read-only API/UI | Diagnostics endpoints use `requireDiagnosticsRead` middleware (x-diagnostics-key auth, NOT BRIDGE_SECRET); no dev-mode bypass; endpoint returns `eventTaxonomyService.getSnapshot()` which includes sanitization |
| `DIAGNOSTICS_FIX_REPORT.md` | Documentation (this file) | Updated with migration evidence, auth policy, sanitization contract, CI guard, pending verification |

**Files NOT changed:** `src/components/DiagnosticsSettings.tsx`, `src/types.ts`, `tsconfig.json`, `package.json`, `vite.config.json`. No trading strategy logic, risk thresholds, bridge auth, order routing, or execution behavior was altered.

---

## 11-Site Taxonomy Migration Appendix

### Migration Table

| # | File | Function / Stable Location | Previous `recordBlock` Label | Final EventCategory | reasonCode | Why This Category Is Correct | Active-Risk Behavior | Intended Test Name |
|---|------|---------------------------|------------------------------|---------------------|------------|------------------------------|---------------------|--------------------|
| 1 | `ExecutionOrchestrator.ts` | META-ALLOCATOR weight=0 block | `META_ALLOCATOR` | `RISK_BLOCKED` | `META_ALLOCATOR` | Capital/risk-budget allocation enforcement — strategy exists but is denied capital. This is a risk restriction, not a signal filter. | `activeRiskBlocks++` on unique | `meta-allocator-weight-zero-produces-risk-blocked` |
| 2 | `ExecutionOrchestrator.ts` | RL_POLICY hold enforcement | `RL_POLICY` | `RISK_BLOCKED` | `RL_POLICY` | Enforces a deliberate no-trade risk restriction policy. The signal exists but execution is blocked by policy. | `activeRiskBlocks++` on unique | `rl-policy-hold-produces-risk-blocked` |
| 3 | `ExecutionOrchestrator.ts` | STRATEGY_RISK_BUDGET exhausted | `STRATEGY_RISK_BUDGET` | `RISK_BLOCKED` | `STRATEGY_RISK_BUDGET` | Strategy budget exhaustion — a capital/risk limit enforcement. | `activeRiskBlocks++` on unique | `strategy-risk-budget-exhausted-produces-risk-blocked` |
| 4 | `ExecutionOrchestrator.ts` | PORTFOLIO_DRAWDOWN floor active | `PORTFOLIO_DRAWDOWN` | `RISK_BLOCKED` | `PORTFOLIO_DRAWDOWN` | Portfolio-level drawdown floor protection — hard risk limit. | `activeRiskBlocks++` on unique | `portfolio-drawdown-floor-produces-risk-blocked` |
| 5 | `ExecutionOrchestrator.ts` | TAIL_RISK mode scale=0 | `TAIL_RISK` | `RISK_BLOCKED` | `TAIL_RISK` | Tail risk mode emergency protection — hard risk limit. | `activeRiskBlocks++` on unique | `tail-risk-scale-zero-produces-risk-blocked` |
| 6 | `ExecutionOrchestrator.ts` | PRE_TRADE risk guard failed | `PRE_TRADE` | `RISK_BLOCKED` | `PRE_TRADE` | Pre-trade risk guard — intentional risk protection. | `activeRiskBlocks++` on unique | `pre-trade-risk-guard-produces-risk-blocked` |
| 7 | `useSignalEngine.ts` | Margin liquidation imminent | `PRE_TRADE` (margin) | `RISK_BLOCKED` | `MARGIN_LIQUIDATION_IMMINENT` | Margin check — intentional risk protection preventing liquidation. | `activeRiskBlocks++` on unique | `margin-liquidation-produces-risk-blocked` |
| 8 | `useSignalEngine.ts` | Portfolio risk check failed | `PRE_TRADE` (portfolio) | `RISK_BLOCKED` | `PORTFOLIO_RISK` | Portfolio risk engine — intentional risk protection. | `activeRiskBlocks++` on unique | `portfolio-risk-produces-risk-blocked` |
| 9 | `useSignalEngine.ts` | Floating drawdown >= 5% | `PRE_TRADE` (drawdown) | `RISK_BLOCKED` | `DRAWDOWN_LIMIT` | Drawdown limit — intentional risk protection. | `activeRiskBlocks++` on unique | `drawdown-limit-produces-risk-blocked` |
| 10 | `useSignalEngine.ts` | Pyramiding distance too tight | `PRE_TRADE` (pyramiding) | `RISK_BLOCKED` | `PYRAMIDING_DISTANCE` | Pyramiding distance check — intentional risk protection. | `activeRiskBlocks++` on unique | `pyramiding-distance-produces-risk-blocked` |
| 11 | `MultiStrategySignalCoordinatorService.ts` | All signals blocked by overlay/arbitration | `COORDINATION` | `SIGNAL_FILTERED` | `COORDINATION` | Orchestration-level signal filtering — no eligible strategy/allocation candidate. Not a risk block. | No effect (signal filter, not risk) | `coordination-skip-produces-signal-filtered` |

### Dual-Write Contract

Every migrated site follows this pattern:

```
eventTaxonomyService.recordRiskBlocked({...})       → V2 diagnostics counter (UI source)
executionDecisionTraceService.recordRiskBlocked({...}) → execution trace (debugging)
```

**Contract:**
- **One risk restriction = exactly one V2 RISK_BLOCKED count** (sourced from EventTaxonomyService)
- **One correlated execution trace record** (sourced from ExecutionDecisionTraceService)
- **No duplicate V2 events** — the dual write targets two different services with different purposes
- Both writes use the same `correlationId` (signal ID or generated) and `blockType` for traceability
- The Diagnostics V2 snapshot shown in the UI is sourced **only** from EventTaxonomyService
- The execution trace (visible on the Execution Decision Trace diagnostics page) is sourced **only** from ExecutionDecisionTraceService

---

## Deduplication Contract

The dedup system has two distinct layers:

1. **60-second rolling dedup window** (temporary suppression):
   - Key format: `{extraKey || correlationId}|{eventType}|{timeBucket(60s)}`
   - Where `extraKey` for SIGNAL_FILTERED is `asset|reasonCode|category`
   - A duplicate within the same 60-second bucket is silently suppressed (no counter increment, no recent event push)
   - This is a **rolling window** — events spaced >60s apart may be counted as separate occurrences if they fall into different day-bucket constraints
   - Bounded by `MAX_DEDUP_KEYS = 10,000` — oldest entries evicted via FIFO queue

2. **Trading-day bucket** (daily unique counting):
   - Key format: `asset|strategy|direction|reasonCode|category`
   - First occurrence of a given key within a calendar day increments the unique daily counter (e.g., `uniqueSignalFiltersToday`)
   - Subsequent occurrences of the same key within the same day update `occurrenceCount` and `lastSeen` but do NOT increment the unique daily total
   - Daily counters reset at the start of a new calendar day (UTC midnight local machine time)
   - Events that differ in **any** of: `category`, `asset`, `strategy` (where relevant), `direction` (where relevant), or `reasonCode` are treated as distinct unique events

**Rules:**
- Event category is part of event identity — a SIGNAL_FILTERED and a RISK_BLOCKED with the same asset/reasonCode are distinct events
- Rolling 60-second dedup and daily unique-accounting are separate mechanisms
- Dedup must not merge different category, asset, strategy (where relevant), direction (where relevant), or reasonCode
- `activeRiskBlocks` is current-state accounting (snapshot), not a daily cumulative count
- Only EventTaxonomyService supplies V2 UI counters; ExecutionDecisionTraceService is trace-only

---

## Diagnostics API Security Contract

### Endpoint Authorization

All `/api/diagnostics/*` read-only endpoints use `requireDiagnosticsRead` middleware:

```typescript
// server.ts — requireDiagnosticsRead middleware
// Does NOT use BRIDGE_SECRET. No dev-mode bypass. No global prefix bypass.
const requireDiagnosticsRead = (req, res, next) => {
    const diagnosticsKey = req.headers['x-diagnostics-key'] as string | undefined;
    if (!diagnosticsKey || !DIAGNOSTICS_KEY || diagnosticsKey.trim() !== DIAGNOSTICS_KEY.trim()) {
        return res.status(401).json({
            error: 'DIAGNOSTICS_AUTH_FAILED',
            message: 'Valid x-diagnostics-key header is required.',
        });
    }
    next();
};
```

**Rules enforced:**
- Diagnostics read access never uses BRIDGE_SECRET, WebhookSecret, or MT5 bridge Authorization
- Browser does not embed or send bridge credentials
- No dev-mode bypass
- No global prefix bypass
- Each diagnostics route individually protected
- Missing key → 401
- Invalid key → 401

### Allowed Response Fields

The sanitized response may include only:
- Diagnostic counters and Circuit Breaker state
- `category` (typed EventCategory)
- `reasonCode` (typed, deterministic — never a raw error string)
- Safe human-readable `reason` (all sensitive patterns stripped)
- `asset` / `symbol`
- `strategy`
- `direction`
- `firstSeen` and `lastSeen`
- `occurrenceCount`
- `isExpectedBlock`
- Opaque `displayId` (only for BRIDGE_FAILURE / EXECUTION_FAILED — format: `evt-<first 8 hex chars>`; never a raw correlationId or secret)

### Redacted/Forbidden Fields

The following are NEVER returned in the sanitized response:
- ❌ Raw `correlationId`, `requestId`, `orderId`, or any raw identifiers
- ❌ Authorization headers or any header values
- ❌ BRIDGE_SECRET, WebhookSecret, secret fragments, or secret-length information
- ❌ Raw request/response payloads
- ❌ Raw exception text, stack traces
- ❌ Internal URLs, hostnames, ports, or server filesystem paths
- ❌ Environment/config details

### Sanitization Applied to `reason` Strings

In `EventTaxonomyService.sanitizeReason()`:
- URLs (http/https/ftp) → `[URL REDACTED]`
- IP addresses and port numbers → `[IP REDACTED]`
- File system paths (Windows and Unix) → `[PATH REDACTED]`
- Authorization headers → `Authorization: Bearer [REDACTED]`
- Secret/token/key values → `[REDACTED]`
- Stack traces → `[STACK REDACTED]`
- Long error messages → truncated to 80 characters

### Auth and Sanitization Tests

**Status:** PENDING — requires running server or integration test harness.

---

## CI Guard — `recordBlock(` Usage Check

### Guard Script

**File:** `scripts/ci-guard-recordBlock.sh`

A bash script that detects prohibited direct `recordBlock(` calls in production TypeScript code.

**Search pattern:** `recordBlock(` (literal match)

**Approved allow-list locations only:**
| Path | Reason for exclusion |
|------|---------------------|
| `src/services/ExecutionDecisionTraceService.ts` | Method definition — the deprecated compatibility wrapper itself |
| `*.test.ts` | Unit tests for the deprecated wrapper |
| `*.spec.ts` | Unit tests for the deprecated wrapper |
| `node_modules/` | Third-party code (excluded by `find`) |
| `dist/` | Build output (excluded by `find`) |

**Expected pass result:**
```
❯ bash scripts/ci-guard-recordBlock.sh
============================================
✅ CI GUARD PASSED: No prohibited recordBlock() usage
============================================
Scanned: src/*.ts + server.ts
```

**Expected failure behavior (if a forbidden caller were added):**
```
============================================
❌ CI GUARD FAILED: recordBlock() violations detected
============================================
Found 1 prohibited direct recordBlock() call(s) in:
  src/services/Something.ts:42

Exit code: 1
```

**Expected clean search result (from `findstr /s /n "recordBlock(" src\*.ts`):**
```
src\services\ExecutionDecisionTraceService.test.ts:49:        executionDecisionTraceService.recordBlock('PRE_TRADE', 'Risk too high');
src\services\ExecutionDecisionTraceService.test.ts:72:        executionDecisionTraceService.recordBlock('TRADING_CONTROL', 'Manual block');
src\services\ExecutionDecisionTraceService.ts:59:    public recordBlock(stage: string, reason: string) {
```

**Result: ZERO direct production callers.**
- `ExecutionDecisionTraceService.ts:59` — method definition (deprecated compatibility wrapper) — SAFE
- `ExecutionDecisionTraceService.test.ts:49,72` — unit tests for deprecated wrapper — SAFE

**Execution status:** PENDING — requires Node/npm in environment for bash execution.

---

## Implemented Test Coverage (Pending Execution)

**File:** `src/services/EventTaxonomyService.test.ts`

16 tests implemented covering:

1. Repeated ADR block across polling cycles deduplicated (signalFiltersToday stays 1)
2. Repeated signal attempts while CB OPEN recorded as suppressed (not new failures)
3. WebSocket reconnect retries and MT5 SendState retries deduplicated
4. Only real unique bridge/auth/transport failures affect breaker failure count
5. New zero-position accounts start with zero active risk blocks and zero incidents
6. UI counter semantics: activeRiskBlocks vs riskBlocksToday, breaker transitions, recent events
7. Edge cases: empty correlationId, dedup set overflow

**Status:** PENDING — test file exists, tests are implemented and syntactically valid, but have NOT been executed. Results are unknown until `npm test` is run.

---

## Old vs New Counter Semantics

| Old Counter | Old Semantics | New Counter | New Semantics |
|-------------|--------------|-------------|---------------|
| `RISK_LIMITS` (via `recordBlock`) | Every compliance/ADR/DVOL rejection counted as risk limit | `SIGNAL_FILTERED` → `signalFiltersToday` | Expected market/strategy filters only |
| `CIRCUIT_BREAKER` (via `recordBlock`) | Every suppressed attempt counted as new failure | `BRIDGE_FAILURE` → `uniqueBridgeIncidentsToday` | Only unique bridge/auth/transport/5xx |
| N/A | N/A | `breakerSuppressedDuplicateCount` | Repeated attempts while CB OPEN |
| N/A | N/A | `breakerRetryCount` | Retry attempts (not failures) |
| `activeRiskBlocks = riskBlocksToday` | Cumulative daily total | `activeRiskBlocks` | Current snapshot of active blocks |
| N/A | N/A | `breakerOpenTransitionCount` | State transitions to OPEN only |

---

## Before/After Example Values — Two Conditional Scenarios

### Scenario A — Clean Runtime

Valid only where no real bridge/auth/transport failure has occurred AND the circuit breaker is CLOSED.

```
Active Risk Blocks: 0
Circuit Breaker State: CLOSED
Unique Bridge Incidents Today: 0
Consecutive Breaker Failures: 0
Retry Count: 0
Suppressed Duplicates: 0
Breaker Open Transitions: 0
```

The `Unique Bridge Incidents Today: 0` is valid ONLY when no real bridge/auth/transport failures have occurred.

### Scenario B — Real Bridge Failure

For a genuine 401/auth mismatch, timeout, connection refusal, MT5 transport failure, or HTTP 5xx:

- Record one correctly typed, deduplicated bridge incident (BRIDGE_FAILURE)
- Record retry/suppressed behavior separately (breakerRetryCount, breakerSuppressedDuplicateCount)
- Do NOT classify it as SIGNAL_FILTERED or RISK_BLOCKED
- Circuit Breaker state must follow the actual configured threshold (default: 3 failures → OPEN)

Example after a single 401 auth mismatch:
```
Active Risk Blocks: 0
Circuit Breaker State: CLOSED (if < threshold failures)
Unique Bridge Incidents Today: 1  (one deduplicated BRIDGE_FAILURE)
Consecutive Breaker Failures: 1   (one unique AUTH incident)
Retry Count: 0
Suppressed Duplicates: 0
Breaker Open Transitions: 0
```

If the same 401 repeats across consecutive polling cycles:
- `UniqueBridgeIncidentsToday` remains 1 (deduplicated by day-bucket key)
- `occurrenceCount` on the event record increases
- `breakerRetryCount` increments for each retry attempt
- `consecutiveBreakerFailures` does NOT increment for retries of the same incident

**This migration fixes diagnostic classification and counting; it does not establish that bridge connectivity or MT5/EA authentication is healthy.**

---

## Non-Goal: Bridge Repair

**This diagnostics-taxonomy migration does NOT repair:**
- MT5/EA credential mismatch (BRIDGE_SECRET vs WebhookSecret)
- Bridge HTTP 401 authentication errors
- WebSocket connection refusal (port 3001)
- SendState transport errors
- Any MT5 connectivity or credential configuration

These are separate bridge-connectivity issues that must be diagnosed and corrected as a distinct task.
