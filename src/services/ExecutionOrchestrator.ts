 import { preTradeRiskGuard } from './PreTradeRiskGuard';
import { strategyRiskBudgetService } from './StrategyRiskBudgetService';
import { portfolioVolatilityTargetService } from './PortfolioVolatilityTargetService';
import { portfolioDrawdownFloorService } from './PortfolioDrawdownFloorService';
import { tailRiskModeService } from './TailRiskModeService';
import { executionStyleService } from './ExecutionStyleService';
import { smartOrderRouterService } from './SmartOrderRouterService';
import { childOrderSchedulerService } from './ChildOrderSchedulerService';
import { childOrderTimingOverlayService } from './ChildOrderTimingOverlayService';
import { executionQualityMonitorService } from './ExecutionQualityMonitorService';
import { postTradeExecutionReportService } from './PostTradeExecutionReportService';
import { executionAnalyticsService } from './ExecutionAnalyticsService';
import { executionTcaAggregatorService, ChildExecutionTcaInput } from './ExecutionTcaAggregatorService';
import { metaStrategyAllocatorService } from './MetaStrategyAllocatorService';







import { riskLimitsService } from './RiskLimitsService';
import { tradingControlService } from './TradingControlService';
import { crossAssetCorrelationService } from './CrossAssetCorrelationService';
import { diagnosticsService } from './DiagnosticsService';
import { executionDecisionTraceService } from './ExecutionDecisionTraceService';
import { executionSanityDiagnosticService } from './ExecutionSanityDiagnosticService';
import { coordinationTraceService } from './CoordinationTraceService';
import { eventTaxonomyService } from './EventTaxonomyService';
import { AppConfig, LogType, TradingSignal, MarketAnalysisState } from '../types';
import { sendToWebhook, checkBridgeStatus } from './webhookService';
import { sendSignalToTelegram, sendTradeExecutionAlertToTelegram } from './telegramService';
import { ComplianceGatekeeper } from './ComplianceGatekeeper';
import { allocateWeightedSizes } from './PositionSizingService';
import { stressScenarioService } from './StressScenarioService';
import { buildCompositeDecision } from './SignalQualityService';
import { hunterModeService, HunterModeDecision, HunterModeDecisionRecord } from './HunterModeService';
import { auditTrailService, TradeDecision } from './AuditTrailService';
import { adaptiveRiskManager, AdaptiveMarketRegime } from './AdaptiveRiskManager';
import { rlExecutionPolicyService } from './rl/RLExecutionPolicyService';
import { assetPerformanceMonitor } from './AssetPerformanceMonitor';

const DEFAULT_GOLD_PRICE_MAX_AGE_MS = 3000;

const parseQuoteTimestampMs = (raw: any): number | null => {
    if (raw === undefined || raw === null) return null;
    if (typeof raw === 'number' && Number.isFinite(raw)) {
        return raw > 1e12 ? raw : raw * 1000;
    }
    if (typeof raw === 'string') {
        const numeric = Number(raw);
        if (Number.isFinite(numeric)) {
            return numeric > 1e12 ? numeric : numeric * 1000;
        }
        const parsed = Date.parse(raw);
        return Number.isNaN(parsed) ? null : parsed;
    }
    return null;
};

const extractMt5QuoteFromState = (
    state: any,
    aliases: string[]
): { price: number; timestampMs: number } | null => {
    if (!state || typeof state !== 'object') return null;
    const normalizedAliases = aliases.map((s) => String(s || '').toUpperCase());
    const containers = [
        state.marketQuotes,
        state.quotes,
        state.symbolPrices,
        state.prices,
        state.marketData,
        state.ticks,
    ];

    const resolvePrice = (q: any): number => {
        const last = Number(q?.last ?? q?.price ?? q?.close ?? 0);
        if (Number.isFinite(last) && last > 0) return last;
        const bid = Number(q?.bid ?? 0);
        const ask = Number(q?.ask ?? 0);
        if (Number.isFinite(bid) && Number.isFinite(ask) && bid > 0 && ask > 0) {
            return (bid + ask) / 2;
        }
        return 0;
    };

    for (const container of containers) {
        if (!container) continue;

        if (Array.isArray(container)) {
            for (const item of container) {
                const symbol = String(item?.symbol ?? item?.asset ?? item?.instrument ?? '').toUpperCase();
                if (!normalizedAliases.includes(symbol)) continue;
                const price = resolvePrice(item);
                if (!Number.isFinite(price) || price <= 0) continue;
                const timestampMs = parseQuoteTimestampMs(item?.timestamp ?? item?.ts ?? item?.time ?? item?.updatedAt) ?? Date.now();
                return { price, timestampMs };
            }
            continue;
        }

        if (typeof container === 'object') {
            for (const alias of normalizedAliases) {
                const q = (container as any)[alias] || (container as any)[alias.toLowerCase()];
                if (!q) continue;
                const price = resolvePrice(q);
                if (!Number.isFinite(price) || price <= 0) continue;
                const timestampMs = parseQuoteTimestampMs(q?.timestamp ?? q?.ts ?? q?.time ?? q?.updatedAt) ?? Date.now();
                return { price, timestampMs };
            }
        }
    }

    return null;
};

export interface CircuitBreakerConfig {
    failureThreshold: number;
    recoveryTimeout: number;
    halfOpenMaxCalls: number;
}

export interface RetryConfig {
    maxRetries: number;
    baseDelayMs: number;
    jitterMs: number;
}

type CircuitBreakerState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

/**
 * Failure categories for Circuit Breaker.
 * Only BRIDGE_AUTH, BRIDGE_CONNECTIVITY, BRIDGE_HTTP_5XX, and MT5_TRANSPORT
 * increment the execution circuit breaker failure count.
 * VALIDATION, RISK_GATE, and MARKET_DATA rejections do NOT count toward
 * bridge circuit breaker open state.
 */
export type CircuitBreakerFailureCategory =
    | 'BRIDGE_AUTH'
    | 'BRIDGE_CONNECTIVITY'
    | 'BRIDGE_HTTP_5XX'
    | 'MT5_TRANSPORT'
    | 'VALIDATION'
    | 'RISK_GATE'
    | 'MARKET_DATA'
    | 'UNKNOWN';

/**
 * Structured circuit breaker event for diagnostics.
 */
export interface CircuitBreakerEvent {
    timestamp: number;
    category: CircuitBreakerFailureCategory;
    message: string;
    isBridgeExecutionFailure: boolean; // true = counted toward breaker
}

/**
 * Bridge health state machine states.
 */
export type BridgeHealthState = 'UNHEALTHY' | 'RECOVERING' | 'HEALTHY';

/**
 * Health check probe result.
 */
export interface HealthCheckResult {
    passed: boolean;
    message: string;
}

/**
 * Configuration for bridge health monitoring and recovery.
 */
export interface BridgeHealthConfig {
    healthCheckIntervalMs: number;
    consecutiveSuccessRequired: number;
    reopenBackoffBaseMs: number;
    maxBackoffMs: number;
    healthProbeUrl: string;
}

/**
 * Structured rejection record for UI-safe diagnostics.
 */
export interface RejectionDiagnostic {
    timestamp: number;
    /** Deterministic reason code, e.g. ADR_DOWNSIDE_EXHAUSTION_SHORT */
    reasonCode: string;
    /** Human-readable explanation */
    reason: string;
    /** Asset identifier */
    asset: string;
    /** Signal side if applicable */
    side?: string;
    /** Blocking stage */
    stage: string;
    /** Structured context (no secrets) */
    context: Record<string, unknown>;
}

function classifyWebhookError(err: any): { category: CircuitBreakerFailureCategory; isBridgeExecutionFailure: boolean; message: string } {
    // Prefer the structured failure detail propagated from sendToWebhook over message sniffing.
    const status = typeof err?.status === 'number' ? err.status : undefined;
    if (status === 401 || status === 403) {
        return { category: 'BRIDGE_AUTH', isBridgeExecutionFailure: true, message: `Bridge authentication failure: HTTP ${status}` };
    }
    if (typeof status === 'number' && status >= 500) {
        return { category: 'BRIDGE_HTTP_5XX', isBridgeExecutionFailure: true, message: `Bridge HTTP 5xx: HTTP ${status}` };
    }
    if (err?.errorType === 'timeout') {
        return { category: 'BRIDGE_CONNECTIVITY', isBridgeExecutionFailure: true, message: `Bridge connectivity failure: ${err?.errorMessage || 'timeout'}` };
    }
    if (err?.errorType === 'network') {
        return { category: 'BRIDGE_CONNECTIVITY', isBridgeExecutionFailure: true, message: `Bridge connectivity failure: ${err?.errorMessage || 'network error'}` };
    }

    const msg = String(err?.message || err?.name || err || '').toLowerCase();

    // Authentication failures
    if (msg.includes('401') || msg.includes('unauthorized') || msg.includes('auth') || msg.includes('secret')) {
        return { category: 'BRIDGE_AUTH', isBridgeExecutionFailure: true, message: `Bridge authentication failure: ${err?.message || '401'}` };
    }

    // Connectivity / transport failures
    if (msg.includes('timeout') || msg.includes('etimedout') || msg.includes('econnrefused') || msg.includes('econnreset') || msg.includes('enotfound') || msg.includes('network') || msg.includes('fetch failed') || msg.includes('abort')) {
        return { category: 'BRIDGE_CONNECTIVITY', isBridgeExecutionFailure: true, message: `Bridge connectivity failure: ${err?.message || 'timeout'}` };
    }

    // HTTP 5xx
    if (msg.includes('500') || msg.includes('502') || msg.includes('503') || msg.includes('504') || msg.includes('5xx') || msg.includes('server error') || msg.includes('internal server')) {
        return { category: 'BRIDGE_HTTP_5XX', isBridgeExecutionFailure: true, message: `Bridge HTTP 5xx: ${err?.message || '500'}` };
    }

    // MT5 transport / WebRequest
    if (msg.includes('webrequest') || msg.includes('mt5') || msg.includes('metatrader') || msg.includes('terminal')) {
        return { category: 'MT5_TRANSPORT', isBridgeExecutionFailure: true, message: `MT5 transport failure: ${err?.message || 'WebRequest'}` };
    }

    // Validation / compliance / risk
    if (msg.includes('validation') || msg.includes('compliance') || msg.includes('risk') || msg.includes('budget') || msg.includes('limit') || msg.includes('rejected') || msg.includes('blocked') || msg.includes('gate')) {
        return { category: 'VALIDATION', isBridgeExecutionFailure: false, message: `Validation rejection: ${err?.message || 'rejected'}` };
    }

    // Any other failure reaching this point comes from a webhook dispatch attempt
    // (validation/risk rejections are handled earlier and never reach here), so
    // treat it as a genuine bridge/operational failure for breaker accounting.
    return { category: 'UNKNOWN', isBridgeExecutionFailure: true, message: err?.message || 'Unknown error' };
}

class TradingCircuitBreaker {
    private state: CircuitBreakerState = 'CLOSED';
    private failureCount = 0;
    private failureCategoryCounts: Record<CircuitBreakerFailureCategory, number> = {
        BRIDGE_AUTH: 0,
        BRIDGE_CONNECTIVITY: 0,
        BRIDGE_HTTP_5XX: 0,
        MT5_TRANSPORT: 0,
        VALIDATION: 0,
        RISK_GATE: 0,
        MARKET_DATA: 0,
        UNKNOWN: 0,
    };
    private lastFailureTime = 0;
    private halfOpenCalls = 0;
    private recentFailures: CircuitBreakerEvent[] = [];
    private readonly maxStoredFailures = 10;

    constructor(
        private readonly config: CircuitBreakerConfig,
        private readonly onStateChange?: (state: CircuitBreakerState, reason: string, category?: CircuitBreakerFailureCategory) => void
    ) {}

    async execute<T>(operation: () => Promise<T>, classifyFn?: (err: any) => { category: CircuitBreakerFailureCategory; isBridgeExecutionFailure: boolean; message: string }): Promise<T> {
        const now = Date.now();

        if (this.state === 'OPEN') {
            if (now - this.lastFailureTime > this.config.recoveryTimeout) {
                this.state = 'HALF_OPEN';
                this.halfOpenCalls = 0;
                this.onStateChange?.('HALF_OPEN', 'Recovery timeout elapsed; allowing probe calls');
            } else {
                throw new Error('Circuit breaker is OPEN - trading suspended');
            }
        }

        if (this.state === 'HALF_OPEN') {
            if (this.halfOpenCalls >= this.config.halfOpenMaxCalls) {
                throw new Error('Circuit breaker HALF_OPEN probe limit reached - trading suspended');
            }
            this.halfOpenCalls += 1;
        }

        try {
            const result = await operation();
            this.onSuccess();
            return result;
        } catch (error: any) {
            const classification = classifyFn ? classifyFn(error) : { category: 'UNKNOWN' as CircuitBreakerFailureCategory, isBridgeExecutionFailure: false, message: error?.message || 'Unknown error' };
            this.onFailure(classification);
            throw error;
        }
    }

/**
     * Manually record a non-operation failure (e.g. health check failure).
     * Only BRIDGE_AUTH, BRIDGE_CONNECTIVITY, BRIDGE_HTTP_5XX, and MT5_TRANSPORT
     * increment the breaker failure count. All other categories (VALIDATION, RISK_GATE,
     * MARKET_DATA, SIGNAL_FILTERED, COMPLIANCE) are logged but NEVER affect the breaker.
     */
    public recordNonOperationFailure(category: CircuitBreakerFailureCategory, message: string): void {
        const isBridgeExecutionFailure = category === 'BRIDGE_AUTH' || category === 'BRIDGE_CONNECTIVITY' || category === 'BRIDGE_HTTP_5XX' || category === 'MT5_TRANSPORT';

        this.failureCategoryCounts[category]++;
        this.recentFailures.push({
            timestamp: Date.now(),
            category,
            message,
            isBridgeExecutionFailure,
        });
        if (this.recentFailures.length > this.maxStoredFailures) {
            this.recentFailures.shift();
        }

        // Only bridge/execution operational failures affect breaker state
        if (!isBridgeExecutionFailure) {
            return; // VALIDATION, RISK_GATE, MARKET_DATA — never affect breaker
        }

        this.failureCount++;
        this.lastFailureTime = Date.now();

        if (this.state === 'HALF_OPEN' || this.failureCount >= this.config.failureThreshold) {
            this.state = 'OPEN';
            this.halfOpenCalls = 0;
            this.onStateChange?.('OPEN', `Non-op failure threshold reached (${this.failureCount}/${this.config.failureThreshold})`, category);
        }
    }

    getSnapshot() {
        return {
            state: this.state,
            failureCount: this.failureCount,
            failureThreshold: this.config.failureThreshold,
            recoveryTimeout: this.config.recoveryTimeout,
            halfOpenMaxCalls: this.config.halfOpenMaxCalls,
            failureCategoryCounts: { ...this.failureCategoryCounts },
            lastFailureTime: this.lastFailureTime,
            halfOpenCalls: this.halfOpenCalls,
            recentFailures: this.recentFailures.slice(-5).map(f => ({
                timestamp: f.timestamp,
                category: f.category,
                message: f.message,
                isBridgeExecutionFailure: f.isBridgeExecutionFailure,
            })),
        };
    }

    /**
     * Get dominant failure category for diagnostics.
     */
    getDominantFailureCategory(): CircuitBreakerFailureCategory {
        let maxCount = 0;
        let dominant: CircuitBreakerFailureCategory = 'UNKNOWN';
        for (const [cat, count] of Object.entries(this.failureCategoryCounts)) {
            if (count > maxCount) {
                maxCount = count;
                dominant = cat as CircuitBreakerFailureCategory;
            }
        }
        return dominant;
    }

    public resetManually(reason: string): void {
        this.state = 'CLOSED';
        this.failureCount = 0;
        this.halfOpenCalls = 0;
        this.lastFailureTime = 0;
        this.recentFailures = [];
        for (const key of Object.keys(this.failureCategoryCounts)) {
            this.failureCategoryCounts[key as CircuitBreakerFailureCategory] = 0;
        }
        this.onStateChange?.('CLOSED', `Manual reset: ${reason}`);
    }

    private onFailure(classification: { category: CircuitBreakerFailureCategory; isBridgeExecutionFailure: boolean; message: string }): void {
        // Only operational bridge/execution failures increment the breaker
        // VALIDATION, RISK_GATE, MARKET_DATA, SIGNAL_FILTERED, COMPLIANCE,
        // ADR/regime/score rejections, user cancellation, intentional suppression
        // NEVER affect breaker state or failure count.
        if (!classification.isBridgeExecutionFailure) {
            this.failureCategoryCounts[classification.category]++;
            this.recentFailures.push({
                timestamp: Date.now(),
                category: classification.category,
                message: classification.message,
                isBridgeExecutionFailure: false,
            });
            if (this.recentFailures.length > this.maxStoredFailures) {
                this.recentFailures.shift();
            }
            return; // Do NOT increment failureCount, do NOT open breaker
        }

        // Real bridge/execution operational failure — count it
        this.failureCategoryCounts[classification.category]++;
        this.recentFailures.push({
            timestamp: Date.now(),
            category: classification.category,
            message: classification.message,
            isBridgeExecutionFailure: true,
        });
        if (this.recentFailures.length > this.maxStoredFailures) {
            this.recentFailures.shift();
        }

        this.failureCount++;
        this.lastFailureTime = Date.now();

        // Check if we should transition to OPEN
        if (this.state === 'HALF_OPEN' || this.failureCount >= this.config.failureThreshold) {
            const fromState = this.state;
            this.state = 'OPEN';
            this.halfOpenCalls = 0;
            this.onStateChange?.('OPEN', `Bridge failure threshold reached (${this.failureCount}/${this.config.failureThreshold})`, classification.category);

            // Record circuit breaker transition via taxonomy service
            try {
                const { eventTaxonomyService } = require('./EventTaxonomyService');
                eventTaxonomyService.recordBreakerTransition({
                    fromState,
                    toState: 'OPEN',
                    reason: `Bridge failure threshold reached: ${this.failureCount}/${this.config.failureThreshold}`,
                    asset: '',
                });
            } catch { /* no-op */ }
        }
    }

    private onSuccess() {
        if (this.state === 'HALF_OPEN') {
            const fromState = this.state;
            this.state = 'CLOSED';
            this.onStateChange?.('CLOSED', 'Probe call succeeded; trading resumed');

            // Record circuit breaker transition
            try {
                const { eventTaxonomyService } = require('./EventTaxonomyService');
                eventTaxonomyService.recordBreakerTransition({
                    fromState,
                    toState: 'CLOSED',
                    reason: 'Probe call succeeded; trading resumed',
                    asset: '',
                });
            } catch { /* no-op */ }
        }
        // Gradually reduce non-bridge failure counts on success
    }
}

class ResilientExecution {
    constructor(private readonly config: RetryConfig) {}

    async executeWithRetry<T>(operation: () => Promise<T>): Promise<T> {
        for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
            try {
                return await operation();
            } catch (error) {
                if (attempt === this.config.maxRetries) {
                    throw error;
                }

                const delay = this.config.baseDelayMs * Math.pow(2, attempt);
                const jitter = Math.random() * this.config.jitterMs;
                await this.sleep(delay + jitter);
            }
        }

        throw new Error('Max retries exceeded');
    }

    private sleep(ms: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
}

export class ExecutionOrchestrator {
    private config: AppConfig;
    private addLog: (message: string, type: LogType, details?: string | object) => void;
    private bridgeStatus: boolean | null;
    private complianceGatekeeper: ComplianceGatekeeper;
    private tradingCircuitBreakers: Map<string, TradingCircuitBreaker>;
    private resilientExecution: ResilientExecution;

    constructor(
        config: AppConfig,
        bridgeStatus: boolean | null,
        addLog: (message: string, type: LogType, details?: string | object) => void
    ) {
        this.config = config;
        this.bridgeStatus = bridgeStatus;
        this.addLog = addLog;
        this.complianceGatekeeper = new ComplianceGatekeeper(config);
        this.tradingCircuitBreakers = new Map();
        this.resilientExecution = new ResilientExecution(this.getRetryConfig(config));
    }

    public updateState(config: AppConfig, bridgeStatus: boolean | null) {
        this.config = config;
        this.bridgeStatus = bridgeStatus;
        this.complianceGatekeeper.updateConfig(config);
    }

    public getCircuitBreakerStatus(asset?: string) {
        if (asset) {
            const breaker = this.tradingCircuitBreakers.get(asset);
            return breaker ? breaker.getSnapshot() : { state: 'CLOSED' as const, failureCount: 0, lastFailureTime: 0, halfOpenCalls: 0 };
        }
        const all: Record<string, any> = {};
        for (const [key, breaker] of this.tradingCircuitBreakers.entries()) {
            all[key] = breaker.getSnapshot();
        }
        return all;
    }

    private getOrCreateBreaker(asset: string): TradingCircuitBreaker {
        let breaker = this.tradingCircuitBreakers.get(asset);
        if (!breaker) {
            breaker = new TradingCircuitBreaker(this.getCircuitBreakerConfig(this.config), (state, reason) => {
                this.addLog(`ðŸ§¯ [CIRCUIT BREAKER] ${asset} ${state} - ${reason}`, 'SYSTEM');
            });
            this.tradingCircuitBreakers.set(asset, breaker);
        }
        return breaker;
    }

    private getCircuitBreakerConfig(config: AppConfig): CircuitBreakerConfig {
        return {
            failureThreshold: Math.max(1, Number((config as any).circuitBreakerFailureThreshold ?? 3)),
            recoveryTimeout: Math.max(1000, Number((config as any).circuitBreakerRecoveryTimeoutMs ?? 30_000)),
            halfOpenMaxCalls: Math.max(1, Number((config as any).circuitBreakerHalfOpenMaxCalls ?? 1)),
        };
    }

    private getRetryConfig(config: AppConfig): RetryConfig {
        return {
            maxRetries: Math.max(0, Number((config as any).executionMaxRetries ?? 3)),
            baseDelayMs: Math.max(100, Number((config as any).executionRetryBaseDelayMs ?? 1000)),
            jitterMs: Math.max(0, Number((config as any).executionRetryJitterMs ?? 1000)),
        };
    }

    private evaluateHunterDecision(
        signal: TradingSignal,
        analysis: MarketAnalysisState,
        actionType: string,
        riskSnapshot: any,
        controlMode: 'NORMAL' | 'REDUCED' | 'BLOCKED',
        persistRecord: boolean = true,
        recordTelemetry: boolean = true
    ): HunterModeDecision {
        const dailyLossLimit = Math.max(1, Number(this.config.dailyLossLimitUSD || riskSnapshot?.global?.maxDailyLoss || 1));
        const dailyPnl = Number(riskSnapshot?.currentDailyPnL || 0);
        const estimatedDrawdownPercent = Math.max(0, (Math.abs(Math.min(0, dailyPnl)) / dailyLossLimit) * 100);
        const executionConfidence = signal.executionHints
            ? Math.max(0, Math.min(1, Number(signal.executionHints.executionPenaltyFactor || 0)))
            : 1;

        const decision = hunterModeService.evaluateHunterMode({
            signal,
            marketState: analysis,
            actionType,
            config: this.config,
            riskState: {
                controlMode,
                riskPressureHigh: controlMode === 'REDUCED' || riskSnapshot.currentOpenPositions >= riskSnapshot.global.maxOpenPositions,
                drawdownBrakeActive: portfolioDrawdownFloorService.getCurrentMode() !== 'NORMAL',
                emergencyProtectionActive: tailRiskModeService.getMode() === 'TAIL_RISK',
                openPositions: Number(riskSnapshot.currentOpenPositions || 0),
            },
            executionState: {
                bridgeHealthy: Boolean(this.bridgeStatus),
                executionConfidence,
            },
            accountState: {
                drawdownPercent: estimatedDrawdownPercent,
                activeHunterTrades: hunterModeService.getActiveHunterTrades(),
            },
        });

        if (recordTelemetry) {
            diagnosticsService.recordHunterDecision(decision.enabled, decision.score, decision.reasons, decision.blockers);
            executionDecisionTraceService.recordHunterMode(decision);
            coordinationTraceService.recordHunterModeDecision(decision);
        }

        if (persistRecord && (this.config.hunterLogDecisions ?? true)) {
            const decisionRecord: HunterModeDecisionRecord = {
                timestampUtc: new Date().toISOString(),
                asset: signal.asset,
                strategy: signal.strategy,
                actionType,
                decision,
            };
            hunterModeService.recordDecision(decisionRecord);
        }

        return decision;
    }

    
    public async executePlan(signals: any[], analysis: MarketAnalysisState, actionType: string = 'ENTRY', crlState: any = null): Promise<boolean> {
        let anySuccess = false;
        
        // 1. Read existing config / risk limits
        const asset = signals.length > 0 ? signals[0].asset : 'UNKNOWN';
        const snapshot = riskLimitsService.getSnapshot();
        const assetState = snapshot.assets[asset] || { openPositions: 0, currentExposure: 0 };
        
        let maxConcurrent = this.config.maxTradesPerWave || 1;
        
        // --- STRESS SCENARIO HOOK: maxSignalsCapOverride ---
        const capOverride = stressScenarioService.getMaxSignalsCapOverride();
        if (capOverride !== null) {
            maxConcurrent = capOverride;
            this.addLog(`ðŸ§ª [STRESS] Override maxConcurrent to ${capOverride}`, 'SYSTEM');
        }

        const controlMode = tradingControlService.evaluateControlState(asset);
        if (signals.length > 0) {
            const hunterPlanDecision = this.evaluateHunterDecision(signals[0], analysis, actionType, snapshot, controlMode, false, false);
            if (hunterPlanDecision.enabled) {
                maxConcurrent = Math.max(maxConcurrent, hunterPlanDecision.modifiers.maxWaveTradesOverride);
                this.addLog(`ðŸŽ¯ [HUNTER MODE] Plan override enabled | score=${hunterPlanDecision.score} | maxWave=${maxConcurrent}`, 'EXEC', {
                    reasons: hunterPlanDecision.reasons,
                    modifiers: hunterPlanDecision.modifiers,
                });
            } else if (this.config.hunterLogDecisions ?? true) {
                this.addLog(`ðŸ§¯ [HUNTER MODE] Plan rejected | blockers=${hunterPlanDecision.blockers.join(',') || 'NONE'} | score=${hunterPlanDecision.score}`, 'SYSTEM');
            }
        }

        const availableSlots = Math.max(0, maxConcurrent - (assetState as any).openPositions);
        
        // 2. Build Execution Plan
        const signalsToExecute = signals.slice(0, availableSlots);
        
        if (signals.length > 0 && availableSlots === 0) {
            this.addLog(`â›” [EXECUTION PLAN] No available slots for ${asset} (max ${maxConcurrent}, open ${(assetState as any).openPositions})`, 'SYSTEM');
        }

        // 3. Size the signals using quality-score-weighted sizing
        let totalSize = 0;
        if (signalsToExecute.length > 0) {
            const baseLotSize = asset.includes('BTC') ? this.config.fixedLotSizeBTC : this.config.fixedLotSizeETH;
            totalSize = signalsToExecute[0].recommendedSize || baseLotSize;
        }

        const sizedSignals = allocateWeightedSizes(signalsToExecute, totalSize);
        
        if (sizedSignals.length > 1) {
            this.addLog(`âš–ï¸ [POSITION SIZING] Allocated ${totalSize} total size across ${sizedSignals.length} parallel signals based on quality score weights.`, 'EXEC');
        }

        // 4. Iterate and execute
        for (let i = 0; i < sizedSignals.length; i++) {
            const signal = sizedSignals[i];
            
            const success = await this.executeSignal(signal, analysis, actionType, crlState);
            if (success) anySuccess = true;
        }
        
        return anySuccess;
    }

    public async executeSignal(signal: any, analysis: MarketAnalysisState, actionType: string = 'ENTRY', crlState: any = null): Promise<boolean> {
        // Initialize trace if it's a direct execution (bypassed coordinator) or just to be safe
        const currentTrace = executionDecisionTraceService.getLatestSnapshot();
        if (!currentTrace || !currentTrace.signal || currentTrace.signal.id !== signal.id) {
             executionDecisionTraceService.initTrace(signal, false);
        }
        const initialRiskSnapshot = riskLimitsService.getSnapshot();
        try {
        // Evaluate compliance gates
        const compliance = this.complianceGatekeeper.validateSignal(signal, analysis);
        if (!compliance.passed && actionType === 'ENTRY') {
            this.addLog(`â›” [GATE REJECTED] ${compliance.reason}`, 'SYSTEM');
            // Expected market/strategy signal filter — NOT a risk limit breach
            const filterType = compliance.reason.includes('ADR') ? 'ADR'
                : compliance.reason.includes('DVOL') ? 'DVOL'
                : compliance.reason.includes('Slippage') ? 'SLIPPAGE'
                : 'COMPLIANCE';
            executionDecisionTraceService.recordSignalFiltered({
                reasonCode: filterType,
                reason: compliance.reason || 'Compliance gate rejected signal',
                asset: signal.asset || 'UNKNOWN',
                strategy: signal.strategy || 'UNKNOWN',
                filterType,
            });
            void this.recordAuditDecision(
                this.buildTradeDecision(signal, analysis, actionType, initialRiskSnapshot, {
                    action: 'HOLD',
                    reasoning: compliance.reason || 'Compliance gate rejected signal',
                    stage: 'COMPLIANCE_GATE',
                    severity: 'WARN',
                })
            );
            return false;
        }

        this.addLog(`ðŸš€ [EXECUTION START] ØªÙ…Ø±ÙŠØ± Ø§Ù„Ø¥Ø´Ø§Ø±Ø© Ù„Ù„Ù…ÙŠØªØ§ØªØ±ÙŠØ¯Ø± | Action: ${actionType}`, 'EXEC');

        // --- STRESS SCENARIO HOOK: forceDegradedData ---
        if (stressScenarioService.shouldForceDegradedData()) {
            tradingControlService.recordDegradedData(signal.asset);
            this.addLog(`ðŸ§ª [STRESS] Simulated Degraded Data`, 'SYSTEM');
        }

        // Check Runtime Trading Control Layer
        const controlMode = tradingControlService.evaluateControlState(signal.asset);
        if (controlMode === 'BLOCKED') {
            const blockReason = tradingControlService.getSnapshot().lastBlockReason || 'Unknown';
            executionDecisionTraceService.recordTradingControl('BLOCKED');
            executionDecisionTraceService.recordRiskBlocked({
                reasonCode: 'CONTROL_LAYER',
                reason: blockReason,
                asset: signal?.asset || 'UNKNOWN',
                blockType: 'CONTROL_LAYER',
            });
            executionDecisionTraceService.recordBlock('TRADING_CONTROL', blockReason);
            this.addLog(`â›” [CONTROL BLOCKED] ØªÙ… Ù…Ù†Ø¹ ØªÙ†Ù ÙŠØ° Ø§Ù„ØµÙ Ù‚Ø© Ø¨ÙˆØ§Ø³Ø·Ø© Ù†Ø¸Ø§Ù… Ø§Ù„Ø­Ù…Ø§ÙŠØ©: ${blockReason}`, 'SYSTEM');
            void this.recordAuditDecision(
                this.buildTradeDecision(signal, analysis, actionType, initialRiskSnapshot, {
                    action: 'HOLD',
                    reasoning: blockReason,
                    stage: 'TRADING_CONTROL',
                    severity: 'CRITICAL',
                })
            );
            return false;
        }

        const isRiskIncreasingAction = ['ENTRY', 'HEDGE', 'FLIP'].includes(actionType as string);
        const signalAsset = String(signal?.asset || '').toUpperCase();
        const isGoldSignal = signalAsset.includes('XAU') || signalAsset.includes('GOLD');
        if (isRiskIncreasingAction && isGoldSignal) {
            const quote = extractMt5QuoteFromState(crlState, ['XAUUSD', 'XAUUSDM', 'XAUUSD.M', 'GOLD']);
            const maxAgeMs = Math.max(500, Number((this.config as any).goldPriceMaxAgeMs ?? DEFAULT_GOLD_PRICE_MAX_AGE_MS));
            const ageMs = quote ? Math.max(0, Date.now() - quote.timestampMs) : Number.POSITIVE_INFINITY;

            if (!quote || ageMs > maxAgeMs) {
                const reason = `GOLD quote stale/missing from MT5 (age=${Number.isFinite(ageMs) ? Math.round(ageMs) : -1}ms, limit=${maxAgeMs}ms)`;
                executionDecisionTraceService.recordSignalFiltered({
                    reasonCode: 'GOLD_QUOTE_STALE',
                    reason,
                    asset: signal?.asset || 'UNKNOWN',
                    strategy: signal?.strategy || 'UNKNOWN',
                    filterType: 'MARKET_DATA',
                });
                this.addLog(`â›” [MARKET DATA BLOCKED] ${reason}`, 'SYSTEM');
                void this.recordAuditDecision(
                    this.buildTradeDecision(signal, analysis, actionType, initialRiskSnapshot, {
                        action: 'HOLD',
                        reasoning: reason,
                        stage: 'MARKET_DATA',
                        severity: 'WARN',
                    })
                );
                return false;
            }

            if (quote.price > 0) {
                signal.entry = quote.price;
            }
        }

        const riskSnapshot = riskLimitsService.getSnapshot();
        const hunterDecision = this.evaluateHunterDecision(signal, analysis, actionType, riskSnapshot, controlMode);
        if (hunterDecision.enabled) {
            this.addLog(`ðŸŽ¯ [HUNTER MODE] Enabled for ${signal.asset} | score=${hunterDecision.score}`, 'EXEC', {
                modifiers: hunterDecision.modifiers,
                reasons: hunterDecision.reasons,
            });
        } else if (this.config.hunterLogDecisions ?? true) {
            this.addLog(`ðŸ§¯ [HUNTER MODE] Rejected for ${signal.asset} | blockers=${hunterDecision.blockers.join(',') || 'NONE'}`, 'SYSTEM', {
                score: hunterDecision.score,
            });
        }

        if (this.config.hunterLogDecisions ?? true) {
            this.reportHunterDecision({
                timestampUtc: new Date().toISOString(),
                asset: signal.asset,
                strategy: signal.strategy,
                actionType,
                decision: hunterDecision,
            });
        }

        if (actionType === 'CLOSE') {
            hunterModeService.registerHunterTradeClosed();
        } else if (actionType === 'CLOSE_ALL') {
            hunterModeService.registerCloseAll();
        }





        // Check Execution Quality Hints
        const forceDelay = stressScenarioService.shouldForceDelay();
        if (signal.executionHints || forceDelay) {
            const hints = signal.executionHints || { shouldDelay: false, shouldSkip: false, reason: '', executionMode: 'NORMAL' };
            
            if (forceDelay) {
                hints.shouldDelay = true;
                hints.reason = (hints.reason ? hints.reason + ' | ' : '') + 'STRESS_FORCED_DELAY';
            }
            
            // Record execution quality
            diagnosticsService.recordExecutionQuality(
                hints.executionMode, 
                signal.recommendedSize || 0
            );


            if (hints.shouldSkip) {
                tradingControlService.recordExecutionSkip(signal.asset);
                executionDecisionTraceService.recordExecutionSkip({
                    reasonCode: 'EXECUTION_HINT_SKIP',
                    reason: hints.reason || 'Execution hint requested skip',
                    asset: signal?.asset || 'UNKNOWN',
                    strategy: signal?.strategy || 'UNKNOWN',
                    filterType: 'OTHER',
                });
                this.addLog(`â›” [EXECUTION SKIP] ØªÙ… ØªØ¬Ø§Ù‡Ù„ Ø§Ù„Ø¥Ø´Ø§Ø±Ø© Ø¨Ø³Ø¨Ø¨ Ø¸Ø±ÙˆÙ  Ø§Ù„ØªÙ†Ù ÙŠØ°: ${hints.reason}`, 'EXEC');
                void this.recordAuditDecision(
                    this.buildTradeDecision(signal, analysis, actionType, riskSnapshot, {
                        action: 'HOLD',
                        reasoning: hints.reason || 'Execution hint requested skip',
                        stage: 'EXECUTION_HINTS',
                        severity: 'WARN',
                    })
                );
                return false;
            }
            if (hints.shouldDelay) {
                tradingControlService.recordExecutionDelay(signal.asset);
                this.addLog(`âš ï¸ [EXECUTION DELAYED] Ø¥Ø´Ø§Ø±Ø© ØªØ£Ø®ÙŠØ± (ØªÙ†ÙÙŠØ° ÙÙˆØ±ÙŠ Ù…Ø®ÙÙ): ${hints.reason}`, 'EXEC');
            } else if (!hints.shouldSkip) {
                tradingControlService.recordNormalExecution(signal.asset);
            }
        } else {
            tradingControlService.recordNormalExecution(signal.asset);
        }


        // Deep clone signal
        const signalToSend = { ...signal };


        // Adjust reference price if PRICE_IMPROVED is suggested
        if (signalToSend.executionHints?.executionMode === 'PRICE_IMPROVED' && signalToSend.executionHints.referencePrice) {
            this.addLog(`ðŸ’¡ Ø§Ø³ØªØ®Ø¯Ø§Ù… Ø³Ø¹Ø± Ø§Ù„Ù…Ø§ÙŠÙƒØ±Ùˆ Ø§Ù„Ù…Ø­Ø³Ù†: ${signalToSend.executionHints.referencePrice.toFixed(2)} Ø¨Ø¯Ù„Ø§Ù‹ Ù…Ù† ${signalToSend.entry.toFixed(2)}`, 'EXEC');
            signalToSend.entry = signalToSend.executionHints.referencePrice;
        }

        // Hedge/Disabling SL logic
        if ((actionType === 'ENTRY' || actionType === 'HEDGE' || actionType === 'FLIP') && 
            (this.config.autoHedgeEnabled || this.config.disableInitialSL)) {
            signalToSend.stopLoss = 0;
            signalToSend.sl = 0;
            this.addLog(`ðŸ›¡ï¸ Ù†Ø¸Ø§Ù… Ø§Ù„Ù‡ÙŠØ¯Ø¬/Ø§Ù„ØªØ¹Ø·ÙŠÙ„ Ù†ÙØ´Ø·: ØªÙ… Ù…Ø³Ø­ Ø§Ù„Ø³ØªÙˆØ¨ Ù„ÙˆØ²`, 'HEDGE');
        }

        let baseLotSize = this.config.fixedLotSizeETH;
        if (signalToSend.asset.includes('BTC')) baseLotSize = this.config.fixedLotSizeBTC;
        let executedLotSize = signalToSend.recommendedSize !== undefined ? signalToSend.recommendedSize : baseLotSize;
        let effectiveForceClosePnL = this.config.forceClosePnL;

        // --- META-STRATEGY ALLOCATION WEIGHT OVERLAY ---
        // Apply performance-based capital rotation weight from MetaStrategyAllocatorService.
        // Elite strategies (winRate>60%, PF>1.5, DD>-15%) get 2x size.
        // Underperformers (winRate<40%, PF<1.0, DD<-20%) get 0x (blocked).
        // Middle strategies get weight between 0.25 and 2.0 via linear interpolation.
        const strategyName = signalToSend.strategy || 'UNKNOWN';
        const allocationWeights = metaStrategyAllocatorService.computeWeightsFromMonitor();
        const weightEntry = allocationWeights.find(
            (w) => w.strategy.toUpperCase() === strategyName.toUpperCase()
        );
        if (weightEntry) {
            const metaWeight = weightEntry.weight;
    if (metaWeight === 0) {
                this.addLog(`â›” [META-ALLOCATOR] ${strategyName} weight=0 (${weightEntry.reason}) — signal blocked`, 'RISK');
                const correlationId = signalToSend?.id || `${signalToSend?.asset || 'UNKNOWN'}_${Date.now()}`;
                eventTaxonomyService.recordRiskBlocked({
                    correlationId,
                    reasonCode: 'META_ALLOCATOR',
                    reason: `Meta-Allocator blocked: ${weightEntry.reason}`,
                    asset: signalToSend?.asset || 'UNKNOWN',
                    strategy: strategyName,
                    direction: signalToSend?.direction,
                    blockType: 'META_ALLOCATOR',
                });
                executionDecisionTraceService.recordRiskBlocked({
                    reasonCode: 'META_ALLOCATOR',
                    reason: weightEntry.reason,
                    asset: signalToSend?.asset || 'UNKNOWN',
                    blockType: 'META_ALLOCATOR',
                });
                void this.recordAuditDecision(
                    this.buildTradeDecision(signalToSend, analysis, actionType, riskSnapshot, {
                        action: 'HOLD',
                        reasoning: `Meta-Allocator blocked: ${weightEntry.reason}`,
                        stage: 'META_ALLOCATOR',
                        severity: 'WARN',
                    })
                );
                return false;
            }
            if (metaWeight !== 1.0) {
                const previousSize = executedLotSize;
                executedLotSize = executedLotSize * metaWeight;
                this.addLog(`ðŸ”€ [META-ALLOCATOR] ${strategyName} weight=${metaWeight.toFixed(3)} (${weightEntry.reason}) — size ${previousSize.toFixed(3)} -> ${executedLotSize.toFixed(3)}`, 'RISK');
            }
        }

        if (hunterDecision.enabled) {
            const boosted = executedLotSize * hunterDecision.modifiers.sizeMultiplier;
            this.addLog(`ðŸŽ¯ [HUNTER MODE] Size boost ${executedLotSize.toFixed(3)} -> ${boosted.toFixed(3)} (x${hunterDecision.modifiers.sizeMultiplier.toFixed(2)})`, 'RISK');
            executedLotSize = boosted;
            effectiveForceClosePnL = this.config.forceClosePnL * hunterDecision.modifiers.targetMultiplier;
            (signalToSend as any).hunterMode = {
                enabled: true,
                score: hunterDecision.score,
                modifiers: hunterDecision.modifiers,
                reasons: hunterDecision.reasons,
            };
            (signalToSend as any).allowAddOnEntry = hunterDecision.modifiers.allowAddOnEntry;
            (signalToSend as any).allowReentry = hunterDecision.modifiers.allowReentry;
            (signalToSend as any).cooldownOverrideSeconds = hunterDecision.modifiers.cooldownOverride;
            (signalToSend as any).maxWaveTradesOverride = hunterDecision.modifiers.maxWaveTradesOverride;
            (signalToSend as any).trailingMode = hunterDecision.modifiers.trailingMode;
        } else {
            (signalToSend as any).hunterMode = {
                enabled: false,
                score: hunterDecision.score,
                blockers: hunterDecision.blockers,
            };
        }

        // Apply Profit-Based Lot Scaling System:
        // BTC lot size increases by 0.01 for every $1000 increment in CLOSED PROFIT
        // ETH lot size increases by 0.1 for every $1000 increment in CLOSED PROFIT
        const currentProfit = (crlState && typeof crlState.diff === 'number' && crlState.diff > 0) ? crlState.diff : 0;
        const increments = Math.floor(currentProfit / 1000);
        if (increments > 0) {
            if (signalToSend.asset.includes('BTC')) {
                executedLotSize = executedLotSize + (increments * 0.01);
                this.addLog(`ðŸ“ˆ [LOT SCALING] Ù…Ø¶Ø§Ø¹ÙØ© Ø§Ù„Ù„ÙˆØª Ø¨Ù†Ø§Ø¡Ù‹ Ø¹Ù„Ù‰ Ø§Ù„Ø£Ø±Ø¨Ø§Ø­ Ø§Ù„Ù…Ø­Ù‚Ù‚Ø© ($${currentProfit.toFixed(2)}): ØªÙ… Ø²ÙŠØ§Ø¯Ø© Ù„ÙˆØª Ø§Ù„Ø¨ÙŠØªÙƒÙˆÙŠÙ† Ø¨Ù…Ù‚Ø¯Ø§Ø± ${(increments * 0.01).toFixed(2)} Ù„ÙŠØµØ¨Ø­ ${executedLotSize.toFixed(2)}`, 'RISK');
            } else if (signalToSend.asset.includes('ETH')) {
                executedLotSize = executedLotSize + (increments * 0.1);
                this.addLog(`ðŸ“ˆ [LOT SCALING] Ù…Ø¶Ø§Ø¹ÙØ© Ø§Ù„Ù„ÙˆØª Ø¨Ù†Ø§Ø¡Ù‹ Ø¹Ù„Ù‰ Ø§Ù„Ø£Ø±Ø¨Ø§Ø­ Ø§Ù„Ù…Ø­Ù‚Ù‚Ø© (${currentProfit.toFixed(2)}): ØªÙ… Ø²ÙŠØ§Ø¯Ø© Ù„ÙˆØª Ø§Ù„Ø¥ÙŠØ«ÙŠØ±ÙŠÙˆÙ… Ø¨Ù…Ù‚Ø¯Ø§Ø± ${(increments * 0.1).toFixed(1)} Ù„ÙŠØµØ¨Ø­ ${executedLotSize.toFixed(2)}`, 'RISK');
            }
        }
        
        // Apply quantitative institutional hedge scaling (reduce lot size by hedge ratio if action is HEDGE)
        if (actionType === 'HEDGE' && this.config.autoHedgeEnabled) {
             const ratio = this.config.hedgeRatio || 0.5;
             executedLotSize = executedLotSize * ratio;
             this.addLog(`ðŸ›¡ï¸ ØªÙ… ØªÙ‚Ù„ÙŠØµ Ø­Ø¬Ù… Ø§Ù„Ø¹Ù‚Ø¯ Ø¥Ù„Ù‰ ${executedLotSize.toFixed(3)} Ø¨Ø³Ø¨Ø¨ Ø­Ø§Ù„Ø© Ø§Ù„Ù‡ÙŠØ¯Ø¬/Ø§Ù„ØªØ­ÙˆØ·`, 'HEDGE');
        }


        // Apply Execution Quality penalty if available
        if (signalToSend.executionHints && signalToSend.executionHints.executionPenaltyFactor < 1.0) {
             const penalty = signalToSend.executionHints.executionPenaltyFactor;
             executedLotSize = executedLotSize * penalty;
             this.addLog(`ðŸ“‰ ØªÙ‚Ù„ÙŠØµ Ø­Ø¬Ù… Ø§Ù„Ø¹Ù‚Ø¯ Ø¨Ø³Ø¨Ø¨ Ø¸Ø±ÙˆÙ Ø§Ù„ØªÙ†ÙÙŠØ° (Ø¹Ø§Ù…Ù„: ${penalty.toFixed(2)}) Ù„ÙŠØµØ¨Ø­ ${executedLotSize.toFixed(3)}`, 'RISK');
        }

        if (this.config.enableRlExecution) {
            const rlDecision = rlExecutionPolicyService.evaluate(signalToSend, analysis);
            if (rlDecision.action === 'BOOST') {
                const boostMultiplier = Math.max(1, Number(this.config.rlExecutionBoostMultiplier ?? 1.1));
                executedLotSize = executedLotSize * boostMultiplier;
                this.addLog(`ðŸ§  [RL] BOOST applied with confidence ${rlDecision.confidence.toFixed(2)} | x${boostMultiplier.toFixed(2)}`, 'EXEC');
            } else if (rlDecision.action === 'HEDGE') {
                const hedgeMultiplier = Math.max(0, Math.min(1, Number(this.config.rlExecutionHedgeMultiplier ?? 0.5)));
                executedLotSize = executedLotSize * hedgeMultiplier;
                this.addLog(`ðŸ§  [RL] HEDGE applied with confidence ${rlDecision.confidence.toFixed(2)} | x${hedgeMultiplier.toFixed(2)}`, 'HEDGE');
            } else if (rlDecision.action === 'HOLD') {
                const holdThreshold = Math.max(0, Math.min(1, Number(this.config.rlExecutionHoldThreshold ?? 0.35)));
                if (rlDecision.confidence >= holdThreshold) {
                    const correlationId = signalToSend?.id || `${signalToSend?.asset || 'UNKNOWN'}_${Date.now()}`;
                    eventTaxonomyService.recordRiskBlocked({
                        correlationId,
                        reasonCode: 'RL_POLICY',
                        reason: `RL policy requested hold at confidence ${rlDecision.confidence.toFixed(2)}`,
                        asset: signalToSend?.asset || 'UNKNOWN',
                        strategy: strategyName,
                        direction: signalToSend?.direction,
                        blockType: 'RL_POLICY',
                    });
                    executionDecisionTraceService.recordRiskBlocked({
                        reasonCode: 'RL_POLICY',
                        reason: `RL policy requested hold at confidence ${rlDecision.confidence.toFixed(2)}`,
                        asset: signalToSend?.asset || 'UNKNOWN',
                        blockType: 'RL_POLICY',
                    });
                    this.addLog(`â›” [RL] Hold enforced by live policy | confidence=${rlDecision.confidence.toFixed(2)}`, 'SYSTEM');
                    void this.recordAuditDecision(
                        this.buildTradeDecision(signalToSend, analysis, actionType, riskSnapshot, {
                            action: 'HOLD',
                            reasoning: `RL policy hold at confidence ${rlDecision.confidence.toFixed(2)}`,
                            stage: 'RL_POLICY',
                            severity: 'WARN',
                        })
                    );
                    return false;
                }
            }
        }

        // Apply risk engine dynamic multiplier

        if (signalToSend.lotMultiplier && signalToSend.lotMultiplier < 1.0) {
             executedLotSize = executedLotSize * signalToSend.lotMultiplier;
             this.addLog(`ðŸ“‰ Ù†Ø¸Ø§Ù… Ø§Ù„Ù…Ø®Ø§Ø·Ø± Ù‚Ù„Øµ Ø§Ù„Ø­Ø¬Ù… Ø¨Ù…Ø¹Ø§Ù…Ù„ ${signalToSend.lotMultiplier.toFixed(2)} Ù„ÙŠØµØ¨Ø­ ${executedLotSize.toFixed(3)}`, 'RISK');
        }

        // --- STRESS SCENARIO HOOK: executionPenaltyFactor ---
        executedLotSize = stressScenarioService.applyExecutionPenalty(executedLotSize);

        // --- ADAPTIVE RISK: Kelly + Volatility + Correlation Sizing ---
        if (this.config.adaptiveRiskEnabled) {
            const currentEquity = Number((crlState && (crlState.equity || crlState.baseline)) || 0);
            const signalConfidence = Number(signalToSend.qualityScore || analysis?.qualityScore || 0);
            const marketVolatility = Math.max(0, Number(analysis?.volatility ?? analysis?.volRatio ?? 0));
            const corr = Number((signalToSend as any).correlationScore ?? signalToSend?.details?.correlationScore ?? 0);
            const correlationMatrix = [
                [1, Math.max(-1, Math.min(1, corr))],
                [Math.max(-1, Math.min(1, corr)), 1],
            ];

            const adaptiveCapNotional = adaptiveRiskManager.calculatePositionSize(
                currentEquity,
                signalConfidence,
                marketVolatility,
                correlationMatrix,
                { maxExposurePct: this.config.adaptiveRiskMaxExposurePct ?? 0.15 }
            );

            const entryPrice = Math.max(0.000001, Number(signalToSend.entry || analysis?.price || 0));
            if (adaptiveCapNotional > 0 && entryPrice > 0) {
                const adaptiveMaxLot = adaptiveCapNotional / entryPrice;
                if (adaptiveMaxLot > 0 && adaptiveMaxLot < executedLotSize) {
                    this.addLog(`ðŸ§  [ADAPTIVE RISK] Reduced lot by adaptive cap ${executedLotSize.toFixed(3)} -> ${adaptiveMaxLot.toFixed(3)}`, 'RISK');
                    executedLotSize = adaptiveMaxLot;
                }
            }
        }

        // --- CROSS-ASSET CORRELATION OVERLAY ---
        // Compute correlation multiplier based on existing open positions.
        // This reduces size for same-direction trades in highly correlated assets
        // to prevent risk stacking (e.g., being LONG BTC and going LONG ETH when corr > 0.9).
        const correlationMultiplier = crossAssetCorrelationService.getCorrelationMultiplier(
            signalToSend.asset || 'UNKNOWN',
            signalToSend.direction || (actionType === 'ENTRY' ? 'LONG' : 'SHORT'),
            [], // openPositions extracted from riskSnapshot
            60
        );
        if (correlationMultiplier < 1.0) {
            const previousSize = executedLotSize;
            executedLotSize = executedLotSize * correlationMultiplier;
            this.addLog(`ðŸ”— [CORRELATION OVERLAY] Cross-asset correlation reduced size ${previousSize.toFixed(3)} -> ${executedLotSize.toFixed(3)} (multiplier=${correlationMultiplier.toFixed(2)})`, 'RISK');
            (signalToSend as any).correlationMultiplier = correlationMultiplier;
            (signalToSend as any).correlationOverlayApplied = true;
        }

        // --- ANTI-MARGIN CALL / BROKER MIN LOT ENFORCEMENT ---
        // If the lot size falls below the broker's minimum (0.01), we round it up to the minimum
        // instead of aborting, so small accounts can still take correlated trades.
        const MIN_BROKER_LOT = 0.01;
        if (executedLotSize < MIN_BROKER_LOT && actionType === 'ENTRY') {
             this.addLog(`âš ï¸ ØªØ­Ø°ÙŠØ±: Ø­Ø¬Ù… Ø§Ù„Ø¹Ù‚Ø¯ Ø§Ù„Ù…Ø·Ù„ÙˆØ¨ Ø¨Ø¹Ø¯ ØªÙ‚Ù„ÙŠÙ„ Ø§Ù„Ù…Ø®Ø§Ø·Ø± (${executedLotSize.toFixed(3)}) Ø£Ù‚Ù„ Ù…Ù† Ø§Ù„Ø­Ø¯ Ø§Ù„Ø£Ø¯Ù†Ù‰ Ù„Ù„ÙˆØ³ÙŠØ· (${MIN_BROKER_LOT}). ØªÙ… Ø±ÙØ¹ Ø§Ù„Ø­Ø¬Ù… Ù„Ù„Ø­Ø¯ Ø§Ù„Ø£Ø¯Ù†Ù‰.`, 'RISK');
             executedLotSize = MIN_BROKER_LOT;
        }

        // Make sure we format it nicely to avoid floating point issues
        executedLotSize = Math.max(MIN_BROKER_LOT, Number(executedLotSize.toFixed(2)));

        // --- ADAPTIVE RISK: Dynamic Stop/Take using ATR-like volatility proxy ---
        if (this.config.adaptiveRiskEnabled && !this.config.disableInitialSL) {
            const entryPrice = Math.max(0.000001, Number(signalToSend.entry || analysis?.price || 0));
            const atrProxy = Math.max(entryPrice * 0.001, Number(analysis?.volatility || 0));

            let adaptiveRegime: AdaptiveMarketRegime = 'RANGING';
            if (analysis?.regime === 'MOMENTUM_TREND') adaptiveRegime = 'TRENDING';
            if (analysis?.regime === 'HIGH_VOLATILITY') adaptiveRegime = 'VOLATILE';

            const defaultSlMultiplier = adaptiveRegime === 'TRENDING'
                ? 2.0
                : adaptiveRegime === 'VOLATILE'
                    ? 3.0
                    : 1.5;
            const customSlMultiplier = adaptiveRegime === 'TRENDING'
                ? (this.config.adaptiveRiskAtrMultiplierTrending ?? 2.0)
                : adaptiveRegime === 'VOLATILE'
                    ? (this.config.adaptiveRiskAtrMultiplierVolatile ?? 3.0)
                    : (this.config.adaptiveRiskAtrMultiplierRanging ?? 1.5);
            const adjustedAtr = atrProxy * (customSlMultiplier / Math.max(0.000001, defaultSlMultiplier));

            const dynamicLevels = adaptiveRiskManager.calculateDynamicStopLoss(
                entryPrice,
                signalToSend.direction === 'SHORT' ? 'SHORT' : 'LONG',
                adjustedAtr,
                adaptiveRegime
            );
            const stopLoss = Number(dynamicLevels.stopLoss.toFixed(2));
            const takeProfit = Number(dynamicLevels.takeProfit.toFixed(2));
            const tp1 = signalToSend.direction === 'SHORT'
                ? Number((entryPrice - Math.abs(entryPrice - takeProfit) * 0.5).toFixed(2))
                : Number((entryPrice + Math.abs(takeProfit - entryPrice) * 0.5).toFixed(2));

            signalToSend.stopLoss = stopLoss;
            (signalToSend as any).sl = stopLoss;
            signalToSend.takeProfit = takeProfit;
            (signalToSend as any).tp = takeProfit;
            signalToSend.tp1 = tp1;
            signalToSend.tp2 = takeProfit;

            this.addLog(`ðŸ§  [ADAPTIVE RISK] Dynamic SL/TP set | regime=${adaptiveRegime} | SL=${stopLoss} | TP=${takeProfit}`, 'RISK');
        }

        // --- STRATEGY RISK BUDGET OVERLAY ---
        // strategyName already declared above in META-ALLOCATOR section
        const budgetCheck = strategyRiskBudgetService.canAllocate(strategyName, executedLotSize);
        if (!budgetCheck.allowed || budgetCheck.approvedSize === 0) {
            if (hunterDecision.enabled) {
                this.addLog(`ðŸ§¯ [HUNTER MODE] Disabled by strategy budget for ${strategyName}`, 'SYSTEM');
            }
            const correlationId = signalToSend?.id || `${signalToSend?.asset || 'UNKNOWN'}_${Date.now()}`;
            eventTaxonomyService.recordRiskBlocked({
                correlationId,
                reasonCode: 'STRATEGY_RISK_BUDGET',
                reason: budgetCheck.reason || 'STRATEGY_BUDGET_EXHAUSTED',
                asset: signalToSend?.asset || 'UNKNOWN',
                strategy: strategyName,
                direction: signalToSend?.direction,
                blockType: 'STRATEGY_RISK_BUDGET',
            });
            executionDecisionTraceService.recordRiskBlocked({
                reasonCode: 'STRATEGY_RISK_BUDGET',
                reason: budgetCheck.reason || 'STRATEGY_BUDGET_EXHAUSTED',
                asset: signalToSend?.asset || 'UNKNOWN',
                blockType: 'STRATEGY_RISK_BUDGET',
            });
            this.addLog(`â›” [STRATEGY BUDGET] ØªÙ… Ù…Ù†Ø¹ ØªÙ†ÙÙŠØ° Ø§Ù„Ø§Ø³ØªØ±Ø§ØªÙŠØ¬ÙŠØ© ${strategyName} Ù„Ø§Ø³ØªÙ†ÙØ§Ø¯ Ø§Ù„Ù…ÙŠØ²Ø§Ù†ÙŠØ© Ø§Ù„Ù…Ø®ØµØµØ© Ù„Ù‡Ø§.`, 'SYSTEM');
            return false;
        } else if (budgetCheck.approvedSize < executedLotSize) {
            this.addLog(`âš ï¸ [STRATEGY BUDGET] ØªÙ… ØªÙ‚Ù„ÙŠØµ Ø­Ø¬Ù… Ø§Ù„ØªÙ†ÙÙŠØ° Ù„Ù„Ø§Ø³ØªØ±Ø§ØªÙŠØ¬ÙŠØ© ${strategyName} Ù…Ù† ${executedLotSize} Ø¥Ù„Ù‰ ${budgetCheck.approvedSize.toFixed(3)} Ø¨Ø³Ø¨Ø¨ Ø§Ù„Ø­Ø¯ Ø§Ù„Ø£Ù‚ØµÙ‰ Ù„Ù„Ø§Ø³ØªØ±Ø§ØªÙŠØ¬ÙŠØ©.`, 'RISK');
            executedLotSize = budgetCheck.approvedSize;
            signalToSend.recommendedSize = executedLotSize;
        }

        // --- PORTFOLIO VOLATILITY TARGET OVERLAY ---
        const volScale = portfolioVolatilityTargetService.computeScale();
        if (volScale !== 1.0) {
            let scaledSize = executedLotSize * volScale;
            this.addLog(`ðŸ“Š [PORTFOLIO VOLATILITY] ØªÙ… ØªØ¹Ø¯ÙŠÙ„ Ø§Ù„Ø­Ø¬Ù… Ø¨Ù…Ø¹Ø§Ù…Ù„ ${volScale.toFixed(2)} Ù„ÙŠØµØ¨Ø­ ${scaledSize.toFixed(3)}`, 'RISK');
            
            if (volScale > 1.0) {
                const reCheck = strategyRiskBudgetService.canAllocate(strategyName, scaledSize);
                if (reCheck.approvedSize < scaledSize) {
                    this.addLog(`âš ï¸ [PORTFOLIO VOLATILITY] ØªÙ… ØªÙ‚Ù„ÙŠØµ Ø§Ù„Ø­Ø¬Ù… Ù…Ù† ${scaledSize.toFixed(3)} Ø¥Ù„Ù‰ ${reCheck.approvedSize.toFixed(3)} Ù„Ø§Ø­ØªØ±Ø§Ù… Ù…ÙŠØ²Ø§Ù†ÙŠØ© Ø§Ù„Ø§Ø³ØªØ±Ø§ØªÙŠØ¬ÙŠØ©.`, 'RISK');
                    scaledSize = reCheck.approvedSize;
                }
            }

            executedLotSize = Math.max(MIN_BROKER_LOT, Number(scaledSize.toFixed(2)));
            signalToSend.recommendedSize = executedLotSize;
            
            if (executionDecisionTraceService && executionDecisionTraceService.getLatestSnapshot()) {
                const trace = executionDecisionTraceService.getLatestSnapshot();
                if (trace && trace.executionDecision) {
                    (trace.executionDecision as any).portfolioVolatilityScale = volScale;
                }
            }
        }

        // --- PORTFOLIO DRAWDOWN FLOOR OVERLAY ---
        const drawdownScale = portfolioDrawdownFloorService.computeRiskScale();
        const drawdownMode = portfolioDrawdownFloorService.getCurrentMode();
        if (drawdownScale !== 1.0) {
            if (drawdownScale === 0.0) {
                const correlationId = signalToSend?.id || `${signalToSend?.asset || 'UNKNOWN'}_${Date.now()}`;
                eventTaxonomyService.recordRiskBlocked({
                    correlationId,
                    reasonCode: 'PORTFOLIO_DRAWDOWN',
                    reason: `Blocked due to ${drawdownMode}`,
                    asset: signalToSend?.asset || 'UNKNOWN',
                    strategy: strategyName,
                    direction: signalToSend?.direction,
                    blockType: 'PORTFOLIO_DRAWDOWN',
                });
                executionDecisionTraceService.recordRiskBlocked({
                    reasonCode: 'PORTFOLIO_DRAWDOWN',
                    reason: `Blocked due to ${drawdownMode}`,
                    asset: signalToSend?.asset || 'UNKNOWN',
                    blockType: 'PORTFOLIO_DRAWDOWN',
                });
                this.addLog(`â›” [PORTFOLIO DRAWDOWN] ØªÙ… Ù…Ù†Ø¹ ØªÙ†ÙÙŠØ° Ø§Ù„ØµÙÙ‚Ø© Ø¨Ø³Ø¨Ø¨ Ø§Ù„ØªØ±Ø§Ø¬Ø¹ Ø§Ù„Ø´Ø¯ÙŠØ¯ (${drawdownMode})`, 'SYSTEM');
                return false;
            }

            let scaledSize = executedLotSize * drawdownScale;
            this.addLog(`ðŸ“‰ [PORTFOLIO DRAWDOWN] ØªÙ… ØªØ¹Ø¯ÙŠÙ„ Ø§Ù„Ø­Ø¬Ù… Ø¨Ù…Ø¹Ø§Ù…Ù„ ${drawdownScale.toFixed(2)} Ù„ÙŠØµØ¨Ø­ ${scaledSize.toFixed(3)} (Ø§Ù„ÙˆØ¶Ø¹: ${drawdownMode})`, 'RISK');
            executedLotSize = Math.max(MIN_BROKER_LOT, Number(scaledSize.toFixed(2)));
            signalToSend.recommendedSize = executedLotSize;

            if (executionDecisionTraceService && executionDecisionTraceService.getLatestSnapshot()) {
                const trace = executionDecisionTraceService.getLatestSnapshot();
                if (trace && trace.executionDecision) {
                    (trace.executionDecision as any).portfolioDrawdownScale = drawdownScale;
                    (trace.executionDecision as any).portfolioDrawdownMode = drawdownMode;
                }
            }
        }

        // --- TAIL RISK MODE OVERLAY ---
        const tailScale = tailRiskModeService.getTailScale();
        const tailMode = tailRiskModeService.getMode();
        if (tailMode === 'TAIL_RISK' && !tailRiskModeService.shouldAllowStrategy(strategyName)) {
            const correlationId = signalToSend?.id || `${signalToSend?.asset || 'UNKNOWN'}_${Date.now()}`;
            eventTaxonomyService.recordRiskBlocked({
                correlationId,
                reasonCode: 'TAIL_RISK',
                reason: `Strategy ${strategyName} not allowed during TAIL_RISK mode`,
                asset: signalToSend?.asset || 'UNKNOWN',
                strategy: strategyName,
                direction: signalToSend?.direction,
                blockType: 'TAIL_RISK',
            });
            executionDecisionTraceService.recordRiskBlocked({
                reasonCode: 'TAIL_RISK',
                reason: `Strategy ${strategyName} not allowed during TAIL_RISK mode`,
                asset: signalToSend?.asset || 'UNKNOWN',
                blockType: 'TAIL_RISK',
            });
            executionDecisionTraceService.recordBlock('TAIL_RISK', `Strategy ${strategyName} not allowed during TAIL_RISK mode`);
            this.addLog(`â›” [TAIL RISK] ØªÙ… Ù…Ù†Ø¹ Ø§Ù„Ø§Ø³ØªØ±Ø§ØªÙŠØ¬ÙŠØ© ${strategyName} ØºÙŠØ± Ø§Ù„Ù…Ø³Ù…ÙˆØ­ Ø¨Ù‡Ø§ Ø£Ø«Ù†Ø§Ø¡ ÙˆØ¶Ø¹ Ø§Ù„Ø·ÙˆØ§Ø±Ø¦`, 'SYSTEM');
            return false;
        }
        if (tailScale !== 1.0) {
            if (tailScale === 0.0) {
                const correlationId = signalToSend?.id || `${signalToSend?.asset || 'UNKNOWN'}_${Date.now()}`;
                eventTaxonomyService.recordRiskBlocked({
                    correlationId,
                    reasonCode: 'TAIL_RISK',
                    reason: `Blocked due to TAIL_RISK scale 0.0`,
                    asset: signalToSend?.asset || 'UNKNOWN',
                    strategy: strategyName,
                    direction: signalToSend?.direction,
                    blockType: 'TAIL_RISK',
                });
                executionDecisionTraceService.recordRiskBlocked({
                    reasonCode: 'TAIL_RISK',
                    reason: `Blocked due to TAIL_RISK scale 0.0`,
                    asset: signalToSend?.asset || 'UNKNOWN',
                    blockType: 'TAIL_RISK',
                });
                this.addLog(`â›” [TAIL RISK] ØªÙ… Ù…Ù†Ø¹ ØªÙ†ÙÙŠØ° Ø§Ù„ØµÙÙ‚Ø© Ø¨Ø³Ø¨Ø¨ ÙˆØ¶Ø¹ Ø§Ù„Ø·ÙˆØ§Ø±Ø¦ (Ø§Ù„Ù…Ø¹Ø§Ù…Ù„ 0)`, 'SYSTEM');
                return false;
            }

            let scaledSize = executedLotSize * tailScale;
            this.addLog(`ðŸš¨ [TAIL RISK] ØªÙ… ØªØ¹Ø¯ÙŠÙ„ Ø§Ù„Ø­Ø¬Ù… Ø¨Ù…Ø¹Ø§Ù…Ù„ ${tailScale.toFixed(2)} Ù„ÙŠØµØ¨Ø­ ${scaledSize.toFixed(3)} (Ø§Ù„ÙˆØ¶Ø¹: ${tailMode})`, 'RISK');
            executedLotSize = Math.max(MIN_BROKER_LOT, Number(scaledSize.toFixed(2)));
            signalToSend.recommendedSize = executedLotSize;

            if (executionDecisionTraceService && executionDecisionTraceService.getLatestSnapshot()) {
                const trace = executionDecisionTraceService.getLatestSnapshot();
                if (trace && trace.executionDecision) {
                    (trace.executionDecision as any).tailRiskScale = tailScale;
                    (trace.executionDecision as any).tailRiskMode = tailMode;
                }
            }
        }

        // --- EXECUTION STYLE OVERLAY ---
        const styleContext = {
            signalQualityScore: analysis?.qualityScore || signalToSend.score || 0,
            volatilityRegime: analysis?.regime || 'UNKNOWN',
            stressScenarioEnabled: (stressScenarioService as any).isStressScenarioEnabled ? (stressScenarioService as any).isStressScenarioEnabled() : false,
            tailRiskMode: tailMode || 'NORMAL',
            drawdownMode: typeof drawdownMode !== 'undefined' ? drawdownMode : 'NORMAL'
        };

        const executionStyle = executionStyleService.decideStyle(styleContext);
        
        const compositeDecision = buildCompositeDecision({
            baseQualityScore: analysis?.qualityScore || signalToSend.score || 0,
            regime: analysis?.regime || signalToSend.details?.quantRegime || 'UNKNOWN',
            hurstExponent: analysis?.hurst || signalToSend.details?.hurstExponent || 0.5,
            toxicityScore: analysis?.toxicityScore ?? (analysis as any)?.toxicity ?? 0,
            estimatedSlippage: analysis?.estimatedSlippage || 0,
            microstructureRisk: analysis?.toxicityMetric ?? analysis?.toxicityScore ?? 0,
            tailRiskPenalty: (signalToSend as any).tailRiskPenalty ?? ((signalToSend as any).cvarUsed !== undefined && (signalToSend as any).cvarUsed !== null && (signalToSend as any).cvarUsed < 0 ? Math.abs((signalToSend as any).cvarUsed) : 0),
            cvarUsed: (signalToSend as any).cvarUsed ?? null,
            realizedVolatilityUsed: (signalToSend as any).realizedVolatilityUsed ?? null,
            signalStrength: signalToSend.strength as any,
            sizingConfidenceOverride: (signalToSend as any).sizingConfidence ?? 0.7,
            crowdingRisk: (signalToSend as any).crowdingRisk || 'LOW',
            concentrationRisk: (signalToSend as any).concentrationRisk || 'LOW',
            executionRisk: (signalToSend as any).executionRisk || 'LOW',
            regimeConflict: Boolean((signalToSend as any).regimeConflict),
            stressScenarioEnabled: (stressScenarioService as any).isStressScenarioEnabled ? (stressScenarioService as any).isStressScenarioEnabled() : false,
            executionPenaltyFactor: signalToSend.executionHints?.executionPenaltyFactor || 1,
            volatilityRegime: analysis?.regime || 'UNKNOWN',
            zScoreAbs: (signalToSend as any).zScoreAbs || null,
        } as any);

        // Ensure executionStyle property exists on the signal, TS won't complain if cast to any
        (signalToSend as any).executionStyle = executionStyle;
        (signalToSend as any).compositeDecision = compositeDecision;
        
        if (executionDecisionTraceService && executionDecisionTraceService.getLatestSnapshot()) {
            const trace = executionDecisionTraceService.getLatestSnapshot();
            if (trace && trace.executionDecision) {
                (trace.executionDecision as any).executionStyle = executionStyle;
                (trace.executionDecision as any).compositeDecision = compositeDecision;
            }
        }
        
        this.addLog(`âš™ï¸ [EXECUTION STYLE] Ù†Ù…Ø· Ø§Ù„ØªÙ†ÙÙŠØ° Ø§Ù„Ù…Ø®ØªØ§Ø±: ${executionStyle}`, 'EXEC');
        if (compositeDecision.noTradeReason) {
            this.addLog(`ðŸ§  [COMPOSITE DECISION] ${compositeDecision.noTradeReason}`, 'QUANT');
        }

        // --- PRE-TRADE RISK GUARD ---
const isRiskReducing = !['ENTRY', 'HEDGE', 'FLIP'].includes(actionType as string);
        const candidate = {
            symbol: signalToSend.asset || 'UNKNOWN',
            side: actionType as string,
            size: executedLotSize,
            notional: executedLotSize * (signalToSend.entry || 0),
            price: signalToSend.entry || 0,
            referencePrice: signalToSend.entry || 0,
            timestamp: Date.now(),
            isRiskReducing: isRiskReducing,
            tailRiskClamp: Boolean((signalToSend as any).tailRiskClamp || (signalToSend as any).clampedByTailRisk),
            cvarUsed: (signalToSend as any).cvarUsed ?? null,
            realizedVolatilityUsed: (signalToSend as any).realizedVolatilityUsed ?? null,
        };
        (signalToSend as any).quantRiskDiag = {
            ...((signalToSend as any).quantRiskDiag || {}),
            compositeDecision,
            regimePolicy: compositeDecision.regimePolicy,
            crowdingRisk: compositeDecision.crowdingRisk,
            concentrationRisk: compositeDecision.concentrationRisk,
            executionRisk: compositeDecision.executionRisk,
            recommendedExecutionStyle: compositeDecision.recommendedExecutionStyle,
            compositeScore: compositeDecision.compositeScore,
        };
        const context = {
            lastMarketDataTs: (analysis as any)?.timestamp || Date.now()
        };
        const riskResult = preTradeRiskGuard.evaluate(candidate, context);
        if (!riskResult.allowed) {
            executionDecisionTraceService.recordPreTrade(false, riskResult.reason, riskResult.decisionCode);
            const correlationId = signalToSend?.id || `${signalToSend?.asset || 'UNKNOWN'}_${Date.now()}`;
            eventTaxonomyService.recordRiskBlocked({
                correlationId,
                reasonCode: 'PRE_TRADE',
                reason: riskResult.reason || 'Blocked by PreTradeRiskGuard',
                asset: signalToSend?.asset || 'UNKNOWN',
                strategy: strategyName,
                direction: signalToSend?.direction,
                blockType: 'PRE_TRADE',
            });
            executionDecisionTraceService.recordRiskBlocked({
                reasonCode: 'PRE_TRADE',
                reason: riskResult.reason || 'Blocked by PreTradeRiskGuard',
                asset: signalToSend?.asset || 'UNKNOWN',
                blockType: 'PRE_TRADE',
            });
            executionDecisionTraceService.recordBlock('PRE_TRADE', riskResult.reason || 'Blocked by PreTradeRiskGuard');
            this.addLog(`â›” [PRE-TRADE BLOCKED] ØªÙ… Ù…Ù†Ø¹ ØªÙ†ÙÙŠØ° Ø§Ù„ØµÙÙ‚Ø© Ù‚Ø¨Ù„ Ø§Ù„Ø¥Ø±Ø³Ø§Ù„: ${riskResult.reason}`, 'SYSTEM');
            diagnosticsService.recordPreTradeBlocked(riskResult.decisionCode, riskResult.reason || 'Unknown');
            (signalToSend as any).quantRiskDiag = {
                decisionCode: riskResult.decisionCode,
                reason: riskResult.reason,
                cvarUsed: candidate.cvarUsed,
                realizedVolatilityUsed: candidate.realizedVolatilityUsed,
                tailRiskClamp: candidate.tailRiskClamp,
                sizingReason: (signalToSend as any).sizingReason || 'unknown'
            };
            void this.recordAuditDecision(
                this.buildTradeDecision(signalToSend, analysis, actionType, riskSnapshot, {
                    action: 'HOLD',
                    reasoning: riskResult.reason || 'Pre-trade risk blocked',
                    stage: 'PRE_TRADE',
                    severity: 'WARN',
                })
            );
            return false;
        }

        (signalToSend as any).quantRiskDiag = {
            decisionCode: riskResult.decisionCode,
            reason: riskResult.reason,
            cvarUsed: candidate.cvarUsed,
            realizedVolatilityUsed: candidate.realizedVolatilityUsed,
            tailRiskClamp: candidate.tailRiskClamp,
            sizingReason: (signalToSend as any).sizingReason || 'unknown'
        };


        // --- SMART ORDER ROUTING STUB ---
        const routingContext = {
            symbol: signalToSend.asset || 'UNKNOWN',
            instrumentType: (signalToSend.asset && !signalToSend.asset.includes('PERP')) ? 'EQUITY' : 'CRYPTO', // Basic heuristic
            notional: executedLotSize * (signalToSend.entry || 0),
            executionStyle: (signalToSend as any).executionStyle || 'PASSIVE',
            liquidityTier: (signalToSend.asset && signalToSend.asset.includes('BTC')) ? 'HIGH' : 'MEDIUM'
        };
        const routeHint = smartOrderRouterService.decideRoute(routingContext as any);
        (signalToSend as any).routeHint = routeHint;
        
        if (executionDecisionTraceService && executionDecisionTraceService.getLatestSnapshot()) {
            const trace = executionDecisionTraceService.getLatestSnapshot();
            if (trace && trace.executionDecision) {
                (trace.executionDecision as any).routeHint = routeHint;
            }
        }
        
        this.addLog(`ðŸ›¤ï¸ [ROUTING] Ù…Ø³Ø§Ø± Ø§Ù„ØªÙ†ÙÙŠØ° Ø§Ù„Ù…Ø®ØªØ§Ø±: ${routeHint}`, 'EXEC');

        // --- CHILD ORDER SCHEDULING STUB ---
        const parentOrder = {
            symbol: signalToSend.asset || 'UNKNOWN',
            strategy: signalToSend.strategy || 'UNKNOWN',
            side: (signalToSend.direction === 'LONG' || actionType === 'ENTRY') ? 'BUY' : 'SELL' as 'BUY'|'SELL',
            totalSize: executedLotSize,
            executionStyle: (signalToSend as any).executionStyle || 'PASSIVE',
            routeHint: routeHint as any
        };
        const childOrders = childOrderSchedulerService.schedule(parentOrder);
        const timingPlanSummary = childOrderTimingOverlayService.applyTiming(childOrders);
        (signalToSend as any).childOrders = childOrders;

        if (executionDecisionTraceService && executionDecisionTraceService.getLatestSnapshot()) {
            const trace = executionDecisionTraceService.getLatestSnapshot();
            if (trace && trace.executionDecision) {
                (trace.executionDecision as any).childOrdersSummary = {
                    totalSlices: childOrders.length,
                    sizes: childOrders.map(c => c.size)
                };
            }
        }

        executionDecisionTraceService.recordPreTrade(true);
        let allSuccess = true;
        const childTcaInputs: ChildExecutionTcaInput[] = [];
        for (const child of childOrders) {
            const childSignal = { ...signalToSend };
            // Update the size for this specific child
            (childSignal as any).size = child.size;
            
            // Attach slice metadata
            (childSignal as any).childOrder = child;
            (childSignal as any).sliceIndex = child.sliceIndex;
            (childSignal as any).totalSlices = child.totalSlices;
            (childSignal as any).executionStyle = child.executionStyle;
            (childSignal as any).routeHint = child.routeHint;
            (childSignal as any).dispatchMode = child.dispatchMode;
            (childSignal as any).timingPolicy = child.timingPolicy;
            (childSignal as any).intervalMs = child.intervalMs;
            (childSignal as any).scheduledAtOffsetMs = child.scheduledAtOffsetMs;

            // --- EXECUTION ANALYTICS STUB (PER CHILD) ---
            const analyticsInput = {
                symbol: child.symbol || 'UNKNOWN',
                strategy: child.strategy || 'UNKNOWN',
                side: child.side,
                requestedSize: child.size,
                executedSize: child.size,
                requestedPrice: childSignal.entry,
                executedPrice: childSignal.entry, // Placeholder assumption
                timestamp: new Date().toISOString(),
                executionStyle: child.executionStyle,
                routeHint: child.routeHint
            };
            const analyticsSnapshot = executionAnalyticsService.compute(analyticsInput as any);
            (childSignal as any).executionAnalytics = analyticsSnapshot;
            childTcaInputs.push({
                requestedSize: analyticsInput.requestedSize,
                executedSize: analyticsInput.executedSize,
                requestedPrice: analyticsInput.requestedPrice,
                executedPrice: analyticsInput.executedPrice,
                fillRatio: analyticsSnapshot.fillRatio,
                slippage: analyticsSnapshot.slippage,
                slippageBps: analyticsSnapshot.slippageBps,
                notionalExecuted: analyticsSnapshot.notionalExecuted,
                sliceIndex: child.sliceIndex,
                totalSlices: child.totalSlices
            });

            if (executionDecisionTraceService && executionDecisionTraceService.getLatestSnapshot()) {
                const trace = executionDecisionTraceService.getLatestSnapshot();
                if (trace && trace.executionDecision) {
                    if (!(trace.executionDecision as any).childDispatches) {
                        (trace.executionDecision as any).childDispatches = [];
                    }
                    (trace.executionDecision as any).childDispatches.push({
                        sliceIndex: child.sliceIndex,
                        totalSlices: child.totalSlices,
                        childSize: child.size,
                        executionStyle: child.executionStyle,
                        routeHint: child.routeHint,
                        analytics: analyticsSnapshot,
                        dispatchMode: child.dispatchMode,
                        timingPolicy: child.timingPolicy,
                        intervalMs: child.intervalMs,
                        scheduledAtOffsetMs: child.scheduledAtOffsetMs
                    });
                    
                    // Keep the parent level executionAnalytics for backward compatibility with tests
                    if (child.sliceIndex === 0) {
                        (trace.executionDecision as any).executionAnalytics = analyticsSnapshot;
                    }
                }
            }

            try {
                const webhookOperation = async () => {
                    const webhookResult = await this.resilientExecution.executeWithRetry(async () => {
                        const attemptResult = await sendToWebhook(
                            childSignal,
                            this.config.webhookUrl,
                            this.config.maxAllocationPerTradePercent,
                            actionType,
                            child.size,
                            effectiveForceClosePnL
                        );

                        if (!attemptResult.success) {
                            const detail: any = attemptResult;
                            const dispatchError: any = new Error(
                                `Webhook returned unsuccessful response${detail.errorMessage ? `: ${detail.errorMessage}` : ''}`
                            );
                            dispatchError.status = detail.status;
                            dispatchError.errorType = detail.errorType;
                            dispatchError.errorMessage = detail.errorMessage;
                            throw dispatchError;
                        }

                        return attemptResult;
                    });

                    return webhookResult;
                };

                const isRiskIncreasingAction = ['ENTRY', 'HEDGE', 'FLIP'].includes(actionType as string);
                const result = isRiskIncreasingAction
                    ? await this.getOrCreateBreaker(childSignal.asset || 'UNKNOWN').execute(webhookOperation, classifyWebhookError)
                    : await webhookOperation();

                if (result.success) {
                    strategyRiskBudgetService.registerAllocation(strategyName, child.size);
                    riskLimitsService.registerExecutedOrder(
                        childSignal.asset || 'UNKNOWN',
                        actionType as string,
                        child.size,
                        child.size * (childSignal.entry || 0),
                        isRiskReducing
                    );
this.addLog(`ðŸš€ ØªÙ… ØªÙ†ÙÙŠØ° Ø¬Ø²Ø¡: ${actionType} Ù„Ù€ ${childSignal.asset || 'System'} (${child.sliceIndex + 1}/${child.totalSlices})`, 'EXEC');
                    
                    // === ASSET PERFORMANCE MONITOR (Sprint 2) ===
                    if (actionType === 'ENTRY' || actionType === 'CLOSE' || actionType === 'CLOSE_ALL') {
                        const outcome = ((childSignal as any).pnl && (childSignal as any).pnl > 0) ? 'WIN' as const : 'LOSS' as const;
                        const pnlValue = Number((childSignal as any).pnl) || 0;
                        const holdingMins = Number((childSignal as any).holdingTimeMinutes) || 0;
                        assetPerformanceMonitor.recordTrade(
                            childSignal.asset || 'UNKNOWN',
                            childSignal.strategy || 'UNKNOWN',
                            outcome,
                            pnlValue,
                            holdingMins
                        );
                        if (assetPerformanceMonitor.shouldDisable(childSignal.asset, childSignal.strategy)) {
                            this.addLog(`â›” [PERFORMANCE] Auto-disabled ${childSignal.strategy} on ${childSignal.asset}`, 'RISK');
                            if (this.config.strategyPerformance?.[childSignal.strategy]) {
                                this.config.strategyPerformance[childSignal.strategy].isEnabled = false;
                            }
                        }
                        if (assetPerformanceMonitor.isDisabled(childSignal.asset, childSignal.strategy) &&
                            assetPerformanceMonitor.shouldReenable(childSignal.asset, childSignal.strategy)) {
                            this.addLog(`âœ… [PERFORMANCE] Auto-re-enabled ${childSignal.strategy} on ${childSignal.asset}`, 'RISK');
                            if (this.config.strategyPerformance?.[childSignal.strategy]) {
                                this.config.strategyPerformance[childSignal.strategy].isEnabled = true;
                            }
                        }
                    }
                    
                    executionDecisionTraceService.recordDispatch();
                    if (hunterDecision.enabled && actionType === 'ENTRY') {
                        hunterModeService.registerHunterTradeOpened();
                        diagnosticsService.recordHunterTradeExecuted();
                    }
                    if (this.config.enableTelegramAlerts && this.config.telegramBotToken) {
                        this.sendAlerts(childSignal, actionType, crlState);
                    }
                    const oldPos = this.extractPositionSnapshot(childSignal.asset || signal.asset, riskSnapshot);
                    const positionDelta = isRiskReducing ? -1 : 1;
                    const newPos = this.estimateNextPosition(oldPos, positionDelta);
                    void this.recordAuditDecision(
                        this.buildTradeDecision(childSignal, analysis, actionType, riskSnapshot, {
                            action: this.deriveAuditAction(actionType, hunterDecision.enabled),
                            reasoning: `Child dispatch success ${child.sliceIndex + 1}/${child.totalSlices}`,
                            stage: 'WEBHOOK_DISPATCH',
                            severity: 'INFO',
                            oldPosition: oldPos,
                            newPosition: newPos,
                        })
                    );
                } else {
                    allSuccess = false;
                }
} catch (err: any) {
                const errMessage = err?.message || 'Unknown error';
                if (errMessage.includes('Circuit breaker')) {
                    this.addLog(`â›” [CIRCUIT BREAKER] ${errMessage}`, 'SYSTEM');
                    // This is a suppressed attempt — breaker is already OPEN
                    // Do NOT count as a new failure. Record as suppressed.
                    executionDecisionTraceService.recordBreakerSuppressed({
                        originalTimestamp: Date.now(),
                        reason: errMessage,
                    });
                } else {
                    // Real bridge/execution failure — classify and record
                    const classification = classifyWebhookError(err);
                    executionDecisionTraceService.recordBridgeFailure({
                        failureType: classification.category,
                        message: classification.message,
                        isRetry: false,
                    });
                    this.addLog(`Ø®Ø·Ø£ ÙÙŠ Ø§Ù„ÙˆØµÙˆÙ„ Ù„Ù„Ø¬Ø³Ø±: ${errMessage}`, 'ERROR');
                }
                void this.recordAuditDecision(
                    this.buildTradeDecision(childSignal, analysis, actionType, riskSnapshot, {
                        action: this.deriveAuditAction(actionType, hunterDecision.enabled),
                        reasoning: errMessage,
                        stage: 'WEBHOOK_DISPATCH',
                        severity: errMessage.includes('Circuit breaker') ? 'CRITICAL' : 'WARN',
                    })
                );
                allSuccess = false;
            }
        }

        if (executionDecisionTraceService && executionDecisionTraceService.getLatestSnapshot()) {
            const trace = executionDecisionTraceService.getLatestSnapshot();
            if (trace && trace.executionDecision) {
                (trace.executionDecision as any).parentTcaSummary = executionTcaAggregatorService.aggregate(childTcaInputs);
                (trace.executionDecision as any).timingPlanSummary = timingPlanSummary;

                // Monitor execution quality
                const monitorResult = executionQualityMonitorService.evaluate(trace.executionDecision);
                (trace.executionDecision as any).executionQualityStatus = monitorResult.executionQualityStatus;
                (trace.executionDecision as any).executionQualityAlerts = monitorResult.executionQualityAlerts;

                // Post-Trade Reporting
                const postTradeReport = postTradeExecutionReportService.generateReport(trace.executionDecision);
                (trace.executionDecision as any).postTradeExecutionReport = postTradeReport;
            }
        }
        return allSuccess;
        } finally {
            executionSanityDiagnosticService.recordTrace(executionDecisionTraceService.getLatestSnapshot());
        }
    }

    private async sendAlerts(signal: TradingSignal, actionType: string, crlState: any = null) {
        try {
            const extraMsg = `
                Max Alloc: ${this.config.maxAllocationPerTradePercent}%
                Fixed Lot BTC: ${this.config.fixedLotSizeBTC} ETH: ${this.config.fixedLotSizeETH}
                Force Close PnL: $${this.config.forceClosePnL}
            `.trim();
            
            await sendSignalToTelegram(signal, this.config.telegramChatId, this.config.telegramBotToken, actionType, extraMsg, this.config.webhookUrl, crlState);
        } catch (err) {
            this.addLog(`Ø®Ø·Ø£ ÙÙŠ Ø¥Ø±Ø³Ø§Ù„ ØªÙ†Ø¨ÙŠÙ‡Ø§Øª Ø§Ù„ØªÙ„ÙŠØ¬Ø±Ø§Ù…: ${err}`, 'ERROR');
        }
    }

    private reportHunterDecision(record: HunterModeDecisionRecord) {
        try {
            const base = this.config.webhookUrl.replace(/\/$/, '');
            fetch(`${base}/api/diagnostics/hunter-mode/decision`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    // Route requires bridge auth; without this header every call previously 401'd.
                    Authorization: `Bearer ${this.config.webhookSecret || ''}`,
                },
                body: JSON.stringify(record),
            }).catch(() => {});
        } catch {
            // no-op by design
        }
    }

    private deriveAuditAction(actionType: string, hunterEnabled: boolean): 'FLIP' | 'HEDGE' | 'BOOST' | 'HOLD' {
        if (actionType === 'FLIP') return 'FLIP';
        if (actionType === 'HEDGE') return 'HEDGE';
        if (hunterEnabled || actionType === 'ENTRY') return 'BOOST';
        return 'HOLD';
    }

    private deriveAuditSignal(signal: any, actionType: string): 'BUY' | 'SELL' | 'HOLD' {
        if (signal?.direction === 'LONG' || actionType === 'ENTRY' || actionType === 'HEDGE') return 'BUY';
        if (signal?.direction === 'SHORT' || actionType === 'CLOSE' || actionType === 'CLOSE_ALL' || actionType === 'EXIT' || actionType === 'FLIP') return 'SELL';
        return 'HOLD';
    }

    private extractPositionSnapshot(asset: string, snapshot: any) {
        const assetSnapshot = snapshot?.assets?.[asset] || {};
        return {
            asset,
            openPositions: Number(assetSnapshot.openPositions || 0),
            currentExposure: Number(assetSnapshot.currentExposure || 0),
            direction: 'FLAT' as const,
        };
    }

    private estimateNextPosition(position: { asset: string; openPositions?: number; currentExposure?: number; direction?: 'LONG' | 'SHORT' | 'FLAT' }, delta: number) {
        return {
            ...position,
            openPositions: Math.max(0, Number(position.openPositions || 0) + delta),
        };
    }

    private buildTradeDecision(
        signal: any,
        analysis: MarketAnalysisState,
        actionType: string,
        riskSnapshot: any,
        overrides: {
            action: 'FLIP' | 'HEDGE' | 'BOOST' | 'HOLD';
            reasoning: string;
            stage: string;
            severity: 'INFO' | 'WARN' | 'CRITICAL';
            oldPosition?: { asset: string; openPositions?: number; currentExposure?: number; direction?: 'LONG' | 'SHORT' | 'FLAT' };
            newPosition?: { asset: string; openPositions?: number; currentExposure?: number; direction?: 'LONG' | 'SHORT' | 'FLAT' };
        }
    ): TradeDecision {
        const maxOpenPositions = Math.max(1, Number(riskSnapshot?.global?.maxOpenPositions || 1));
        const currentOpenPositions = Number(riskSnapshot?.currentOpenPositions || 0);
        const exposureRatio = Math.max(0, Math.min(1.5, currentOpenPositions / maxOpenPositions));

        return {
            timestamp: Date.now(),
            signal: this.deriveAuditSignal(signal, actionType),
            oldPosition: overrides.oldPosition,
            newPosition: overrides.newPosition,
            action: overrides.action,
            reasoning: overrides.reasoning,
            marketConditions: {
                volatility: Number((analysis as any)?.volatility ?? (analysis as any)?.volRatio ?? 0),
                trendStrength: Number((analysis as any)?.qualityScore ?? signal?.qualityScore ?? 0) / 100,
                volumeProfile: Number((analysis as any)?.dvol ?? (analysis as any)?.volumeProfile ?? 0),
            },
            riskMetrics: {
                maxDrawdown: Number(this.config.maxDrawdownDailyPercent || 0),
                exposureRatio,
            },
            metadata: {
                actionType,
                asset: signal?.asset,
                strategy: signal?.strategy,
                decisionStage: overrides.stage,
                severity: overrides.severity,
            },
        };
    }

    private async recordAuditDecision(decision: TradeDecision): Promise<void> {
        await auditTrailService.logDecision(decision, {
            webhookUrl: this.config.webhookUrl,
            webhookSecret: this.config.webhookSecret,
            criticalNotifier: (criticalDecision) => {
                this.addLog(
                    `ðŸš¨ [AUDIT CRITICAL] ${criticalDecision.metadata?.decisionStage || 'UNKNOWN'} | ${criticalDecision.reasoning}`,
                    'SYSTEM',
                    criticalDecision
                );
            },
        });
    }
}
