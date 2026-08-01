import { TradingSignal, EventCategory } from '../types';
import { eventTaxonomyService } from './EventTaxonomyService';

export type ExecutionDecisionTraceSnapshot = {
  createdAt: string;
  signal: TradingSignal | null;
  coordinationUsed: boolean;
  tradingControlState?: string;
  preTradeDecision?: {
    allowed: boolean;
    reason?: string;
    code?: string;
    timestamp?: number;
  };
  executionDecision?: {
    attempted: boolean;
    dispatched: boolean;
    blockedStage?: string;
    reason?: string;
    compositeDecision?: any;
    rejectionReason?: string;
    adaptiveMemorySummary?: any;
    counterfactualSummary?: any;
        hunterMode?: {
            enabled: boolean;
            score: number;
            reasons: string[];
            blockers: string[];
            modifiers: any;
        };
  };
};

class ExecutionDecisionTraceService {
    private latestSnapshot: ExecutionDecisionTraceSnapshot | null = null;

    public initTrace(signal: TradingSignal | null, coordinationUsed: boolean) {
        this.latestSnapshot = {
            createdAt: new Date().toISOString(),
            signal: signal ? JSON.parse(JSON.stringify(signal)) : null,
            coordinationUsed,
            executionDecision: {
                attempted: false,
                dispatched: false
            }
        };
    }

    public recordTradingControl(state: string) {
        if (this.latestSnapshot) {
            this.latestSnapshot.tradingControlState = state;
        }
    }

    public recordPreTrade(allowed: boolean, reason?: string, code?: string) {
        if (this.latestSnapshot) {
            this.latestSnapshot.preTradeDecision = { allowed, reason, code };
        }
    }

    public recordBlock(stage: string, reason: string) {
        if (this.latestSnapshot && this.latestSnapshot.executionDecision) {
            this.latestSnapshot.executionDecision.attempted = true;
            this.latestSnapshot.executionDecision.dispatched = false;
            this.latestSnapshot.executionDecision.blockedStage = stage;
            this.latestSnapshot.executionDecision.reason = reason;
        }
    }

    public recordDispatch() {
        if (this.latestSnapshot && this.latestSnapshot.executionDecision) {
            this.latestSnapshot.executionDecision.attempted = true;
            this.latestSnapshot.executionDecision.dispatched = true;
            this.latestSnapshot.executionDecision.blockedStage = undefined;
            this.latestSnapshot.executionDecision.reason = undefined;
        }
    }

    public recordHunterMode(decision: {
        enabled: boolean;
        score: number;
        reasons: string[];
        blockers: string[];
        modifiers: any;
    }) {
        if (this.latestSnapshot && this.latestSnapshot.executionDecision) {
            this.latestSnapshot.executionDecision.hunterMode = JSON.parse(JSON.stringify(decision));
        }
    }

    public getLatestSnapshot(): ExecutionDecisionTraceSnapshot | null {
        return this.latestSnapshot;
    }

    // ─── New Taxonomy Methods (v2) ───────────────────────────────────

/**
     * Record an expected signal filter event (ADR, regime, score rejection).
     * These are NOT risk blocks or bridge failures.
     */
    public recordSignalFiltered(params: {
        reasonCode: string;
        reason: string;
        asset: string;
        strategy: string;
        filterType: string;
    }): void {
        const correlationId = this.latestSnapshot?.signal?.id || `${params.asset}_${Date.now()}`;
        const direction = this.latestSnapshot?.signal?.direction;
        eventTaxonomyService.recordSignalFiltered({
            correlationId,
            reasonCode: params.reasonCode,
            reason: params.reason,
            asset: params.asset,
            strategy: params.strategy,
            direction: direction ? direction.toString() : undefined,
            filterType: params.filterType,
        });
        if (this.latestSnapshot && this.latestSnapshot.executionDecision) {
            this.latestSnapshot.executionDecision.attempted = true;
            this.latestSnapshot.executionDecision.dispatched = false;
            this.latestSnapshot.executionDecision.blockedStage = 'SIGNAL_FILTERED';
            this.latestSnapshot.executionDecision.reason = params.reason;
        }
    }

    /**
     * Record a deliberate risk/compliance/position-exposure block.
     */
    public recordRiskBlocked(params: {
        reasonCode: string;
        reason: string;
        asset: string;
        blockType: string;
    }): void {
        const correlationId = this.latestSnapshot?.signal?.id || `${params.asset}_${Date.now()}`;
        eventTaxonomyService.recordRiskBlocked({
            correlationId,
            reasonCode: params.reasonCode,
            reason: params.reason,
            asset: params.asset,
            blockType: params.blockType,
        });
        if (this.latestSnapshot && this.latestSnapshot.executionDecision) {
            this.latestSnapshot.executionDecision.attempted = true;
            this.latestSnapshot.executionDecision.dispatched = false;
            this.latestSnapshot.executionDecision.blockedStage = 'RISK_BLOCKED';
            this.latestSnapshot.executionDecision.reason = params.reason;
        }
    }

    public recordBridgeFailure(params: {
        failureType: string;
        message: string;
        requestId?: string;
        isRetry: boolean;
    }): void {
        const correlationId = this.latestSnapshot?.signal?.id || `bridge_${Date.now()}`;
        eventTaxonomyService.recordBridgeFailure({
            correlationId,
            failureType: params.failureType,
            message: params.message,
            requestId: params.requestId,
            isRetry: params.isRetry,
        });
        if (this.latestSnapshot && this.latestSnapshot.executionDecision) {
            this.latestSnapshot.executionDecision.attempted = true;
            this.latestSnapshot.executionDecision.dispatched = false;
            this.latestSnapshot.executionDecision.blockedStage = 'BRIDGE_FAILURE';
            this.latestSnapshot.executionDecision.reason = params.message;
        }
    }

    /**
     * Record a circuit breaker state transition.
     */
    public recordBreakerTransition(params: {
        fromState: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
        toState: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
        reason: string;
        asset: string;
    }): void {
        eventTaxonomyService.recordBreakerTransition(params);
    }

    public recordBreakerSuppressed(params: {
        originalTimestamp: number;
        reason: string;
    }): void {
        const correlationId = this.latestSnapshot?.signal?.id || `suppressed_${Date.now()}`;
        eventTaxonomyService.recordBreakerSuppressed({
            correlationId,
            originalTimestamp: params.originalTimestamp,
            reason: params.reason,
        });
        if (this.latestSnapshot && this.latestSnapshot.executionDecision) {
            this.latestSnapshot.executionDecision.attempted = true;
            this.latestSnapshot.executionDecision.dispatched = false;
            this.latestSnapshot.executionDecision.blockedStage = 'ERROR';
            this.latestSnapshot.executionDecision.reason = params.reason;
        }
    }

    public recordExecutionFailed(params: {
        reason: string;
        asset: string;
    }): void {
        const correlationId = this.latestSnapshot?.signal?.id || `exec_${Date.now()}`;
        eventTaxonomyService.recordExecutionFailed({
            correlationId,
            reason: params.reason,
            asset: params.asset,
        });
        if (this.latestSnapshot && this.latestSnapshot.executionDecision) {
            this.latestSnapshot.executionDecision.attempted = true;
            this.latestSnapshot.executionDecision.dispatched = false;
            this.latestSnapshot.executionDecision.blockedStage = 'EXECUTION_FAILED';
            this.latestSnapshot.executionDecision.reason = params.reason;
        }
    }

    /**
     * Record that an execution was intentionally skipped.
     */
    public recordExecutionSkip(params: {
        reasonCode: string;
        reason: string;
        asset: string;
        strategy: string;
        filterType: string;
    }): void {
        const correlationId = this.latestSnapshot?.signal?.id || `${params.asset}_${Date.now()}`;
        eventTaxonomyService.recordSignalFiltered({
            correlationId,
            reasonCode: params.reasonCode,
            reason: params.reason,
            asset: params.asset,
            strategy: params.strategy,
            filterType: params.filterType,
        });
        if (this.latestSnapshot && this.latestSnapshot.executionDecision) {
            this.latestSnapshot.executionDecision.attempted = true;
            this.latestSnapshot.executionDecision.dispatched = false;
            this.latestSnapshot.executionDecision.blockedStage = 'EXECUTION_HINTS';
            this.latestSnapshot.executionDecision.reason = params.reason;
        }
    }
}

export const executionDecisionTraceService = new ExecutionDecisionTraceService();

