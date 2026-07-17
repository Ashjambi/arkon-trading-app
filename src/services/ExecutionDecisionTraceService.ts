import { TradingSignal } from '../types';

export type ExecutionDecisionTraceSnapshot = {
  createdAt: string;
  signal: TradingSignal | null;
  coordinationUsed: boolean;
  tradingControlState?: string;
  preTradeDecision?: {
    allowed: boolean;
    reason?: string;
    code?: string;
  };
  executionDecision?: {
    attempted: boolean;
    dispatched: boolean;
    blockedStage?: string;
    reason?: string;
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

    public getLatestSnapshot(): ExecutionDecisionTraceSnapshot | null {
        return this.latestSnapshot;
    }
}

export const executionDecisionTraceService = new ExecutionDecisionTraceService();
