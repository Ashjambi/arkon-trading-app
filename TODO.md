# TODO — EventTaxonomyService Fixes

## Step 1 — Fix syntax corruption in Test 9
- [x] Fix unterminated test declaration (indentation of `// Fast-forward to next day`)

## Step 2 — Direction-sensitive dedup identity tests for SIGNAL_FILTERED
- [ ] Strengthen test proving BTC/ADR/LONG and BTC/ADR/SHORT remain distinct
- [ ] Add test proving same identity inside 60s is suppressed
- [ ] Add test proving post-window behavior
- [ ] Add test proving no UI counter inflation

## Step 3 — Bridge 401 identity tests (incidentFingerprint via bridgeOperation)
- [ ] Verify SIGNAL_DISPATCH and MT5_STATE_SYNC are distinct incidents
- [ ] Verify identical failures in same operation/dedup scope do not inflate unique counts
- [ ] Verify sanitized snapshots/API responses omit bridgeOperation and all internal fields
- [ ] Add typed union for bridgeOperation if backward-compatible

## Step 4 — Run all EventTaxonomyService tests
- [ ] `npx vitest run src/services/EventTaxonomyService.test.ts`

## Step 5 — TypeScript check
- [ ] `npx tsc --noEmit`

## Step 6 — Targeted tests
- [ ] ExecutionOrchestrator test run
- [ ] useSignalEngine test run
- [ ] MultiStrategySignalCoordinatorService test run
- [ ] CI guard execution
- [ ] Final `recordBlock(` search

## Return deliverables
- [ ] List of files changed
- [ ] Git diff for EventTaxonomyService.ts and EventTaxonomyService.test.ts
- [ ] Test mapping: test | contract | expected | actual | result
- [ ] Raw test output
- [ ] Raw tsc output
- [ ] CI guard output
- [ ] Final recordBlock search result
