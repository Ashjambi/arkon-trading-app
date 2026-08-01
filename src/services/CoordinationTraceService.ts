import { TradingSignal } from '../types';
import { OverlayDecision } from './PortfolioRiskOverlayService';
import { ArbitrationResult } from './StrategyArbitrationService';

export type CoordinationTraceSnapshot = {
  asset?: string;
  createdAt: string;
  inputSignals: TradingSignal[];
  overlayDecisions: OverlayDecision[];
  arbitrationResult: ArbitrationResult;
  finalSignals: TradingSignal[];
    hunterModeDecision?: any;
};

class CoordinationTraceService {
    private latestSnapshot: CoordinationTraceSnapshot | null = null;

    public updateSnapshot(
        inputSignals: TradingSignal[],
        overlayDecisions: OverlayDecision[],
        arbitrationResult: ArbitrationResult,
        finalSignals: TradingSignal[]
    ) {
        // We assume all signals in a batch are for the same asset
        const asset = inputSignals.length > 0 ? inputSignals[0].asset : undefined;
        this.latestSnapshot = {
            asset,
            createdAt: new Date().toISOString(),
            inputSignals: JSON.parse(JSON.stringify(inputSignals)),
            overlayDecisions: JSON.parse(JSON.stringify(overlayDecisions)),
            arbitrationResult: JSON.parse(JSON.stringify(arbitrationResult)),
            finalSignals: JSON.parse(JSON.stringify(finalSignals)),
        };
    }

    public getLatestSnapshot(): CoordinationTraceSnapshot | null {
        return this.latestSnapshot;
    }

    public recordHunterModeDecision(decision: any) {
        if (!this.latestSnapshot) return;
        this.latestSnapshot.hunterModeDecision = JSON.parse(JSON.stringify(decision));
    }
}

export const coordinationTraceService = new CoordinationTraceService();
