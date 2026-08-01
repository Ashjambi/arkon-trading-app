import { TradingSignal } from '../../types';

export type RLExecutionAction = 'BOOST' | 'HEDGE' | 'HOLD' | 'NO_CHANGE';

export interface RLExecutionPolicySnapshot {
    enabled: boolean;
    lastUpdatedAt: string | null;
    lastAction: RLExecutionAction;
    lastConfidence: number;
    policyVector: number[];
}

class RLExecutionPolicyService {
    private snapshot: RLExecutionPolicySnapshot = {
        enabled: false,
        lastUpdatedAt: null,
        lastAction: 'NO_CHANGE',
        lastConfidence: 0,
        policyVector: [],
    };

    public updateFromTraining(policy: number[][] | undefined, enabled: boolean = true): void {
        const policyVector = Array.isArray(policy)
            ? policy.slice(0, 5).map((row) => Number(row?.[0] ?? 0))
            : [];

        this.snapshot = {
            enabled,
            lastUpdatedAt: new Date().toISOString(),
            lastAction: this.snapshot.lastAction,
            lastConfidence: this.snapshot.lastConfidence,
            policyVector,
        };
    }

    public evaluate(signal: TradingSignal, analysis: any): { action: RLExecutionAction; confidence: number } {
        if (!this.snapshot.enabled || this.snapshot.policyVector.length === 0) {
            return { action: 'NO_CHANGE', confidence: 0 };
        }

        const quality = Number(analysis?.qualityScore ?? signal?.qualityScore ?? 0);
        const volatility = Number(analysis?.volatility ?? analysis?.volRatio ?? 0);
        const trend = signal.direction === 'LONG' ? 1 : -1;
        const policyBias = this.snapshot.policyVector.reduce((sum, value) => sum + value, 0);
        const score = (quality / 100) + (trend * 0.1) - Math.min(1, volatility / 1000) + policyBias;

        let action: RLExecutionAction = 'NO_CHANGE';
        if (score >= 0.6) {
            action = 'BOOST';
        } else if (score <= -0.2) {
            action = 'HEDGE';
        } else if (score < 0.15) {
            action = 'HOLD';
        }

        const confidence = Math.max(0, Math.min(1, Math.abs(score)));
        this.snapshot = {
            ...this.snapshot,
            lastUpdatedAt: new Date().toISOString(),
            lastAction: action,
            lastConfidence: confidence,
        };

        return { action, confidence };
    }

    public getSnapshot(): RLExecutionPolicySnapshot {
        return { ...this.snapshot, policyVector: [...this.snapshot.policyVector] };
    }
}

export const rlExecutionPolicyService = new RLExecutionPolicyService();