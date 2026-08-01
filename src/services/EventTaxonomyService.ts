/**
 * EventTaxonomyService — Deduplication engine for diagnostics counters.
 *
 * Separate counters for:
 *  - SIGNAL_FILTERED:   Expected market/strategy rejections (ADR, regime, score)
 *  - RISK_BLOCKED:      Intentional pre-trade risk/compliance limit blocks
 *  - EXECUTION_FAILED:  Real submitted execution failures
 *  - BRIDGE_FAILURE:    Unique auth/transport/timeout/5xx incidents
 *  - CIRCUIT_BREAKER_TRANSITION: State changes only
 *  - CIRCUIT_BREAKER_SUPPRESSED: Repeated attempts while breaker OPEN
 *
 * Day-bucket accounting (Option B from review):
 *  - "Today" counters are unique by asset + strategy + direction + reasonCode per local trading day.
 *  - Repeated occurrences within the same day update occurrenceCount/lastSeen, not the unique total.
 *  - 60-second rolling dedup prevents duplicate logging within the same cycle.
 */

import type { DailyEventRecord, DiagnosticsCountersV2, EventCategory } from '../types';

const DEDUP_WINDOW_MS = 60_000;
const MAX_DEDUP_KEYS = 10_000;
const MAX_RECENT_EVENTS = 50;

export type BridgeOperation =
  | 'SIGNAL_DISPATCH'
  | 'MT5_STATE_SYNC'
  | 'ORDER_EXECUTION'
  | 'HEARTBEAT'
  | (string & {});

interface RecentEventEntry {
  category: EventCategory;
  timestamp: number;
  reasonCode: string;
  reason: string;
  asset: string;
  strategy?: string;
  direction?: string;
  correlationId: string;
  occurrenceCount: number;
  isExpectedBlock: boolean;
}

export class EventTaxonomyService {
  private dedupSet = new Set<string>();
  private dedupQueue: string[] = [];

  // Core V2 counters
  private counters: DiagnosticsCountersV2 = this.initialCounters();

  // Day tracking for daily resets
  private lastDayReset = Date.now();

  // Day-bucket event records: keyed by "asset|strategy|direction|reasonCode|category"
  // Each record tracks firstSeen, lastSeen, occurrenceCount within the current trading day.
  private dailyRecords = new Map<string, DailyEventRecord>();

  private initialCounters(): DiagnosticsCountersV2 {
    return {
      activeRiskBlocks: 0,
      circuitBreakerState: 'CLOSED',
      circuitBreakerAsset: null,
      uniqueSignalFiltersToday: 0,
      uniqueRiskBlocksToday: 0,
      uniqueBridgeIncidentsToday: 0,
      consecutiveBreakerFailures: 0,
      breakerFailureThreshold: 3,
      breakerRetryCount: 0,
      breakerSuppressedDuplicateCount: 0,
      breakerOpenTransitionCount: 0,
      recentEvents: [],
    };
  }

  /** Reset daily counters if a new calendar day has started. */
  private checkDailyReset(): void {
    const now = Date.now();
    const dayStart = new Date(now).setHours(0, 0, 0, 0);
    const lastDayStart = new Date(this.lastDayReset).setHours(0, 0, 0, 0);
    if (dayStart !== lastDayStart) {
      this.counters.uniqueRiskBlocksToday = 0;
      this.counters.uniqueSignalFiltersToday = 0;
      this.counters.uniqueBridgeIncidentsToday = 0;
      this.counters.breakerRetryCount = 0;
      this.counters.breakerSuppressedDuplicateCount = 0;
      this.counters.consecutiveBreakerFailures = 0;
      this.dailyRecords.clear();
      this.lastDayReset = now;
    }
  }

  /**
   * Build the canonical day-bucket key for an event.
   * Used for daily unique counting: same key within the same trading day
   * updates occurrenceCount/lastSeen but does not increment the unique total.
   */
  private dayBucketKey(params: {
    asset: string;
    strategy?: string;
    direction?: string;
    reasonCode: string;
    category: EventCategory;
  }): string {
    return `${params.asset}|${params.strategy || 'UNKNOWN'}|${params.direction || 'UNKNOWN'}|${params.reasonCode}|${params.category}`;
  }

  /**
   * Check if an event is a duplicate within the 60-second dedup window.
   * Uses (correlationId OR asset+reasonCode) + eventType + time bucket.
   * Each polling cycle creates a new signal ID, so correlationId alone
   * is insufficient. We include asset+reasonCode so the same ADR block
   * on BTC within the 60s window is correctly deduplicated across cycles.
   */
  private isDuplicate(correlationId: string, eventType: string, extraKey?: string): boolean {
    if (!correlationId && !extraKey) return false;
    const now = Date.now();
    const bucket = Math.floor(now / DEDUP_WINDOW_MS);
    const effectiveKey = extraKey || correlationId;
    const key = `${effectiveKey}|${eventType}|${bucket}`;
    if (this.dedupSet.has(key)) return true;
    this.dedupSet.add(key);
    this.dedupQueue.push(key);
    // Keep dedup set bounded — evict oldest entries
    while (this.dedupQueue.length > MAX_DEDUP_KEYS) {
      const oldest = this.dedupQueue.shift();
      if (oldest) this.dedupSet.delete(oldest);
    }
    return false;
  }

  private pushRecentEvent(entry: RecentEventEntry): void {
    this.counters.recentEvents.unshift(entry);
    if (this.counters.recentEvents.length > MAX_RECENT_EVENTS) {
      this.counters.recentEvents.pop();
    }
  }

  /**
   * Update day-bucket tracking for an event.
   * Returns true if this is a NEW unique event today (first occurrence of this key today).
   */
  private trackDayBucket(
    key: string,
    params: {
      category: EventCategory;
      reasonCode: string;
      reason: string;
      asset: string;
      strategy?: string;
      direction?: string;
    },
  ): boolean {
    this.checkDailyReset();
    const existing = this.dailyRecords.get(key);
    const now = Date.now();

    if (existing) {
      // Update occurrence count and lastSeen, but do NOT increment unique total
      existing.occurrenceCount++;
      existing.lastSeen = now;
      return false; // not a new unique event today
    }

    // First occurrence of this key today
    this.dailyRecords.set(key, {
      key,
      firstSeen: now,
      lastSeen: now,
      occurrenceCount: 1,
      category: params.category,
      reasonCode: params.reasonCode,
      reason: params.reason,
      asset: params.asset,
      strategy: params.strategy || 'UNKNOWN',
      direction: params.direction,
    });
    return true; // new unique event today
  }

  // ─── SIGNAL_FILTERED ──────────────────────────────────────────────

  /**
   * Record an expected market/strategy-level signal rejection.
   * These NEVER count as risk blocks or bridge failures.
   * Deduplicated by:
   *   a) 60-second rolling window (correlationId + asset|reasonCode)
   *   b) Day-bucket key (asset|strategy|direction|reasonCode|SIGNAL_FILTERED)
   * Returns true if this was a unique event (not a duplicate).
   */
  public recordSignalFiltered(params: {
    correlationId: string;
    reasonCode: string;
    reason: string;
    asset: string;
    strategy: string;
    direction?: string;
    filterType: string;
  }): boolean {
    this.checkDailyReset();
    // 60-second dedup: use asset|strategy|direction|reasonCode so
    // distinct LONG vs SHORT diagnostics on the same asset do not collapse.
    // The day-bucket key already includes these fields; the rolling dedup
    // must match to prevent counter inflation.
    const extraKey = `${params.asset}|${params.strategy}|${params.direction || 'UNKNOWN'}|${params.reasonCode}`;
    if (this.isDuplicate(params.correlationId, 'SIGNAL_FILTERED', extraKey)) {
      return false;
    }

    // Day-bucket accounting: unique by asset+strategy+direction+reasonCode per trading day
    const dayKey = this.dayBucketKey({
      asset: params.asset,
      strategy: params.strategy,
      direction: params.direction,
      reasonCode: params.reasonCode,
      category: 'SIGNAL_FILTERED',
    });
    const isNewUnique = this.trackDayBucket(dayKey, {
      category: 'SIGNAL_FILTERED',
      reasonCode: params.reasonCode,
      reason: params.reason,
      asset: params.asset,
      strategy: params.strategy,
      direction: params.direction,
    });

    if (isNewUnique) {
      this.counters.uniqueSignalFiltersToday++;
    }

    this.pushRecentEvent({
      category: 'SIGNAL_FILTERED',
      timestamp: Date.now(),
      reasonCode: params.reasonCode,
      reason: params.reason,
      asset: params.asset,
      strategy: params.strategy,
      direction: params.direction,
      correlationId: params.correlationId,
      occurrenceCount: this.dailyRecords.get(dayKey)?.occurrenceCount || 1,
      isExpectedBlock: true,
    });
    return true;
  }

  // ─── RISK_BLOCKED ─────────────────────────────────────────────────

  /** Reason codes that are genuine risk protections (not market filters). */
  public static readonly RISK_BLOCK_REASON_CODES = new Set([
    'EXPOSURE_LIMIT',
    'POSITION_LIMIT',
    'DAILY_LOSS',
    'NOTIONAL_LIMIT',
    'PRE_TRADE',
    'STRATEGY_BUDGET',
    'PORTFOLIO_DRAWDOWN',
    'TAIL_RISK',
    'CONTROL_LAYER',
    'BLOCKED_EXPOSURE',
    'BLOCKED_SIZE',
    'BLOCKED_NOTIONAL',
    'BLOCKED_THROTTLE',
    'BLOCKED_STALE_DATA',
    'BLOCKED_CONTROL_LAYER',
    'BLOCKED_TAIL_RISK',
    'BLOCKED_CORRELATION',
    'RL_POLICY',
    'META_ALLOCATOR',
    'STRATEGY_RISK_BUDGET',
    'PORTFOLIO_DRAWDOWN_FLOOR',
    'TAIL_RISK_MODE',
  ]);

  /** Reason codes that are expected market/strategy filters (not risk blocks). */
  public static readonly SIGNAL_FILTER_REASON_CODES = new Set([
    'ADR',
    'ADR_EXHAUSTION',
    'DVOL',
    'SLIPPAGE',
    'REGIME',
    'SCORE',
    'CONTRADICTION',
    'HURST',
    'RSQUARED',
    'COOLDOWN',
    'CORRELATION',
    'COMPLIANCE',
    'MARKET_DATA',
    'GOLD_QUOTE_STALE',
    'COINTEGRATION',
    'STRATEGY_CONDITION',
  ]);

  /**
   * Record a deliberate pre-trade risk/compliance/position-exposure block.
   * Deduplicated by:
   *   a) 60-second rolling window
   *   b) Day-bucket key (asset|strategy|direction|reasonCode|RISK_BLOCKED)
   * activeRiskBlocks tracks the current active count (snapshot, not cumulative).
   */
  public recordRiskBlocked(params: {
    correlationId: string;
    reasonCode: string;
    reason: string;
    asset: string;
    strategy?: string;
    direction?: string;
    blockType: string;
  }): boolean {
    this.checkDailyReset();

    // 60-second dedup
    const extraKey = `${params.asset}|${params.reasonCode}`;
    if (this.isDuplicate(params.correlationId, 'RISK_BLOCKED', extraKey)) {
      return false;
    }

    // Day-bucket accounting
    const dayKey = this.dayBucketKey({
      asset: params.asset,
      strategy: params.strategy,
      direction: params.direction,
      reasonCode: params.reasonCode,
      category: 'RISK_BLOCKED',
    });
    const isNewUnique = this.trackDayBucket(dayKey, {
      category: 'RISK_BLOCKED',
      reasonCode: params.reasonCode,
      reason: params.reason,
      asset: params.asset,
      strategy: params.strategy,
      direction: params.direction,
    });

    if (isNewUnique) {
      this.counters.uniqueRiskBlocksToday++;
    }

    // activeRiskBlocks is a snapshot of CURRENT active blocks
    // It increments on each new block event (deduped by 60s window)
    this.counters.activeRiskBlocks++;

    this.pushRecentEvent({
      category: 'RISK_BLOCKED',
      timestamp: Date.now(),
      reasonCode: params.reasonCode,
      reason: params.reason,
      asset: params.asset,
      strategy: params.strategy,
      direction: params.direction,
      correlationId: params.correlationId,
      occurrenceCount: this.dailyRecords.get(dayKey)?.occurrenceCount || 1,
      isExpectedBlock: true,
    });
    return true;
  }

  /**
   * Decrement active risk blocks when a block is lifted (e.g., position closed, risk condition resolved).
   */
  public clearRiskBlock(): void {
    this.counters.activeRiskBlocks = Math.max(0, this.counters.activeRiskBlocks - 1);
  }

  /**
   * Reset active risk blocks to zero (e.g., after full position close or risk reset).
   */
  public resetActiveRiskBlocks(): void {
    this.counters.activeRiskBlocks = 0;
  }

  // ─── BRIDGE_FAILURE ───────────────────────────────────────────────

  /**
   * Record a unique bridge/auth/transport/5xx incident.
   * Deduplicated by:
   *   a) 60-second rolling window (correlationId + requestId)
   *   b) Day-bucket key (asset|strategy|direction|failureType|BRIDGE_FAILURE)
   * Only unique incidents increment the breaker failure count.
   * Retries do NOT create new unique incidents — they increment breakerRetryCount.
   */
  /**
   * Record a unique bridge/auth/transport/5xx incident.
   * Deduplicated by:
   *   a) 60-second rolling window (correlationId + requestId)
   *   b) Day-bucket key (asset|strategy|direction|failureType|bridgeOperation|BRIDGE_FAILURE)
   * Only unique incidents increment the breaker failure count.
   * Retries do NOT create new unique incidents — they increment breakerRetryCount.
   *
   * The optional bridgeOperation field provides a safe typed discriminator for
   * distinguishing genuinely distinct bridge incidents that share the same
   * asset/failureType (e.g., SIGNAL_DISPATCH vs MT5_STATE_SYNC).
   * It is never exposed to the browser/UI — used only for server-side dedup.
   */
  public recordBridgeFailure(params: {
    correlationId: string;
    failureType: string;
    message?: string;
    reason?: string;
    requestId?: string;
    isRetry?: boolean;
    asset?: string;
    strategy?: string;
    /** Server-only typed discriminator for distinguishing distinct bridge operations.
     *  Never exposed to the UI. Use for incidents that share asset/failureType
     *  but are contractually distinct (e.g., SIGNAL_DISPATCH vs MT5_STATE_SYNC). */
    bridgeOperation?: BridgeOperation;
  }): { isUniqueIncident: boolean } {
    this.checkDailyReset();

    const extraKey = params.requestId || `${params.asset || ''}|${params.failureType}|${params.bridgeOperation || ''}`;
    const isUnique = !this.isDuplicate(params.correlationId, 'BRIDGE_FAILURE', extraKey);

    if (isUnique) {
      // Day-bucket accounting for bridge incidents
      // Include bridgeOperation as a safe typed discriminator when present,
      // so contractually distinct incidents (e.g., SIGNAL_DISPATCH vs MT5_STATE_SYNC)
      // on the same asset/failureType are counted separately.
      const dayKey = this.dayBucketKey({
        asset: params.asset || 'BRIDGE',
        strategy: params.strategy,
        direction: params.bridgeOperation, // safe typed discriminator, never exposed to UI
        reasonCode: params.failureType,
        category: 'BRIDGE_FAILURE',
      });
      const isNewUniqueDay = this.trackDayBucket(dayKey, {
        category: 'BRIDGE_FAILURE',
        reasonCode: params.failureType,
        reason: params.message || params.reason || '',
        asset: params.asset || 'BRIDGE',
        strategy: params.strategy,
      });

      if (isNewUniqueDay) {
        this.counters.uniqueBridgeIncidentsToday++;
      }

      // Only increment consecutive breaker failures for unique incidents
      this.counters.consecutiveBreakerFailures++;

      this.pushRecentEvent({
        category: 'BRIDGE_FAILURE',
        timestamp: Date.now(),
        reasonCode: params.failureType,
        reason: params.message || params.reason || '',
        asset: params.asset || 'BRIDGE',
        strategy: params.strategy,
        correlationId: params.correlationId,
        occurrenceCount: isNewUniqueDay ? 1 : (this.dailyRecords.get(dayKey)?.occurrenceCount || 1),
        isExpectedBlock: false,
      });
    }

    if (params.isRetry) {
      this.counters.breakerRetryCount++;
    }

    return { isUniqueIncident: isUnique };
  }

  // ─── CIRCUIT_BREAKER_SUPPRESSED ───────────────────────────────────

  /**
   * Record that an attempt was suppressed because the Circuit Breaker is OPEN.
   * This does NOT count as a new bridge failure.
   * Deduplicated by:
   *   a) 60-second rolling window
   *   b) Day-bucket: asset|strategy|direction|BREAKER_OPEN|CIRCUIT_BREAKER_SUPPRESSED
   */
  public recordBreakerSuppressed(params: {
    correlationId: string;
    originalTimestamp: number;
    reason: string;
    asset?: string;
    strategy?: string;
  }): void {
    this.checkDailyReset();

    // 60-second dedup for suppressed events
    const extraKey = `${params.asset || 'UNKNOWN'}|BREAKER_OPEN`;
    if (this.isDuplicate(params.correlationId, 'CIRCUIT_BREAKER_SUPPRESSED', extraKey)) {
      return;
    }

    this.counters.breakerSuppressedDuplicateCount++;

    this.pushRecentEvent({
      category: 'CIRCUIT_BREAKER_SUPPRESSED',
      timestamp: Date.now(),
      reasonCode: 'BREAKER_OPEN',
      reason: params.reason,
      asset: params.asset || '',
      strategy: params.strategy,
      correlationId: params.correlationId,
      occurrenceCount: 1,
      isExpectedBlock: true,
    });
  }

  // ─── CIRCUIT_BREAKER_TRANSITION ───────────────────────────────────

  /**
   * Record a circuit breaker state transition.
   * This is NOT a failure count — it's a state change event.
   */
  public recordBreakerTransition(params: {
    fromState: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
    toState: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
    reason: string;
    asset: string;
  }): void {
    this.checkDailyReset();

    // Update snapshot state
    this.counters.circuitBreakerState = params.toState;
    this.counters.circuitBreakerAsset = params.asset;

    if (params.toState === 'OPEN') {
      this.counters.breakerOpenTransitionCount++;
    }

    // On transition to CLOSED, reset consecutive failures
    if (params.toState === 'CLOSED') {
      this.counters.consecutiveBreakerFailures = 0;
    }

    this.pushRecentEvent({
      category: 'CIRCUIT_BREAKER_TRANSITION',
      timestamp: Date.now(),
      reasonCode: `${params.fromState}_TO_${params.toState}`,
      reason: params.reason,
      asset: params.asset,
      correlationId: `transition_${Date.now()}`,
      occurrenceCount: 1,
      isExpectedBlock: true,
    });
  }

  // ─── EXECUTION_FAILED ─────────────────────────────────────────────

  /**
   * Record a real execution failure (signal was accepted, bridge received it,
   * but the actual execution failed).
   */
  public recordExecutionFailed(params: {
    correlationId: string;
    reason: string;
    asset: string;
    strategy?: string;
  }): void {
    this.checkDailyReset();
    this.pushRecentEvent({
      category: 'EXECUTION_FAILED',
      timestamp: Date.now(),
      reasonCode: 'EXECUTION_FAILED',
      reason: params.reason,
      asset: params.asset,
      strategy: params.strategy,
      correlationId: params.correlationId,
      occurrenceCount: 1,
      isExpectedBlock: false,
    });
  }

  // ─── SANITIZATION ─────────────────────────────────────────────────

  /**
   * Sanitize a DiagnosticsCountersV2 snapshot for safe browser/UI consumption.
   * Strips raw correlationId, requestId, orderId, secrets, stacks, URLs, ports,
   * server filesystem paths, and internal config details.
   * Replaces correlationId with a short opaque display ID where traceability is needed.
   *
   * The sanitized response includes only:
   * - counters and Circuit Breaker state
   * - category
   * - typed reasonCode
   * - safe human-readable reason
   * - asset/symbol
   * - strategy
   * - direction
   * - firstSeen and lastSeen
   * - occurrenceCount
   * - isExpectedBlock
   * - opaque display ID only where necessary (never secrets)
   */
  public sanitizeSnapshot(snapshot: DiagnosticsCountersV2): DiagnosticsCountersV2 {
    if (!snapshot || typeof snapshot !== 'object') return snapshot;

    return {
      ...snapshot,
      recentEvents: (snapshot.recentEvents || []).map((event) => {
        // Strip raw correlationId — never expose to browser
        // If traceability is needed, provide a short opaque display ID
        const safeEvent: any = {
          category: event.category,
          timestamp: event.timestamp,
          reasonCode: event.reasonCode,
          reason: this.sanitizeReason(event.reason),
          asset: event.asset,
          strategy: event.strategy,
          direction: event.direction,
          occurrenceCount: event.occurrenceCount,
          isExpectedBlock: event.isExpectedBlock,
        };

        // Only add opaque display ID for operational incidents where traceability aids debugging
        // Never for correlationId itself — we strip it completely
        if (event.category === 'BRIDGE_FAILURE' || event.category === 'EXECUTION_FAILED') {
          safeEvent.displayId = event.correlationId && typeof event.correlationId === 'string'
            ? `evt-${event.correlationId.substring(0, 8)}`
            : undefined;
        }

        return safeEvent;
      }),
    };
  }

  /**
   * Sanitize a reason string to remove any sensitive data.
   * Strips: URLs, IP addresses, file paths, port numbers, secret fragments,
   * Authorization header values, and known secret-like patterns.
   */
  private sanitizeReason(reason: string): string {
    if (!reason || typeof reason !== 'string') return reason;

    let sanitized = reason;

    // Strip URLs (http/https/ftp)
    sanitized = sanitized.replace(/https?:\/\/[^\s,;)]+/gi, '[URL REDACTED]');
    sanitized = sanitized.replace(/ftp:\/\/[^\s,;)]+/gi, '[URL REDACTED]');

    // Strip IP addresses (IPv4)
    sanitized = sanitized.replace(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}(:\d+)?\b/g, '[IP REDACTED]');

    // Strip file system paths (Windows and Unix)
    sanitized = sanitized.replace(/[A-Za-z]:\\[^\s,;)]+/g, '[PATH REDACTED]');
    sanitized = sanitized.replace(/\/[^\s,;)]+\/[^\s,;)]+/g, '[PATH REDACTED]');

    // Strip port numbers commonly used in error messages
    sanitized = sanitized.replace(/port\s+\d+/gi, 'port [REDACTED]');
    sanitized = sanitized.replace(/:\d{4,5}/g, ':[PORT]');

    // Strip Authorization-like patterns
    sanitized = sanitized.replace(/Authorization:\s*Bearer\s+\S+/gi, 'Authorization: Bearer [REDACTED]');
    sanitized = sanitized.replace(/Bearer\s+\S{10,}/g, 'Bearer [REDACTED]');

    // Strip secret/token/key-like values
    sanitized = sanitized.replace(/secret[=:]\s*\S+/gi, 'secret=[REDACTED]');
    sanitized = sanitized.replace(/token[=:]\s*\S+/gi, 'token=[REDACTED]');
    sanitized = sanitized.replace(/key[=:]\s*\S+/gi, 'key=[REDACTED]');

    // Strip stack-trace-like patterns
    sanitized = sanitized.replace(/at\s+\S+\.\S+\s+\([^)]+\)/g, '[STACK REDACTED]');
    sanitized = sanitized.replace(/Error:\s*.+/g, (match) => {
      return match.length > 80 ? match.substring(0, 77) + '...' : match;
    });

    return sanitized;
  }

  // ─── SNAPSHOT ─────────────────────────────────────────────────────

  /** Get the full V2 counters snapshot. */
  public getSnapshot(): DiagnosticsCountersV2 {
    this.checkDailyReset();
    const raw = {
      ...this.counters,
      recentEvents: this.counters.recentEvents.slice(0, 20),
    };
    return this.sanitizeSnapshot(raw);
  }

  /** Get the daily event records (for diagnostics). */
  public getDailyRecords(): Map<string, DailyEventRecord> {
    this.checkDailyReset();
    return new Map(this.dailyRecords);
  }

  /** Reset all counters (for testing). */
  public reset(): void {
    this.counters = this.initialCounters();
    this.dedupSet.clear();
    this.dedupQueue = [];
    this.dailyRecords.clear();
    this.lastDayReset = Date.now();
  }
}

/** Singleton instance */
export const eventTaxonomyService = new EventTaxonomyService();

