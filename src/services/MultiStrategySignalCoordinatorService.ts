import { TradingSignal } from '../types';
import { portfolioRiskOverlayService, OverlayDecision } from './PortfolioRiskOverlayService';
import { strategyArbitrationService, ArbitrationResult } from './StrategyArbitrationService';
import { diagnosticsService } from './DiagnosticsService';
import { coordinationTraceService } from './CoordinationTraceService';
import { executionDecisionTraceService } from './ExecutionDecisionTraceService';

export type SignalCoordinationResult = {
    inputSignals: TradingSignal[];
    overlayDecisions: OverlayDecision[];
    arbitrationResult: ArbitrationResult;
    finalSignals: TradingSignal[];
};

class MultiStrategySignalCoordinatorService {
    public coordinate(signals: TradingSignal[]): SignalCoordinationResult {
        // 1. Pass all signals through the portfolio risk overlay
        const overlayDecisions = portfolioRiskOverlayService.evaluateSignals(signals);
        
        // 2. Filter out suppressed signals from the overlay
        const signalsPassingOverlay = overlayDecisions
            .filter(decision => !decision.suppressed)
            .map(decision => decision.originalSignal);

        // 3. Pass remaining signals through strategy arbitration
        const arbitrationResult = strategyArbitrationService.arbitrate(signalsPassingOverlay);

        // 4. Extract final signals
        const finalSignals = arbitrationResult.selectedSignals.map(decision => decision.signal);

        // 5. Diagnostics
        diagnosticsService.recordCoordinationRun(signals.length, finalSignals.length);
        coordinationTraceService.updateSnapshot(signals, overlayDecisions, arbitrationResult, finalSignals);
        
        if (finalSignals.length > 0) {
            executionDecisionTraceService.initTrace(finalSignals[0], true);
        } else if (signals.length > 0) {
            executionDecisionTraceService.initTrace(signals[0], true);
            // This is a coordination-level signal filter (no eligible strategy/allocation candidate),
            // not a risk block. Use SIGNAL_FILTERED taxonomy.
            executionDecisionTraceService.recordSignalFiltered({
                reasonCode: 'COORDINATION',
                reason: 'Signal blocked by risk overlay or arbitration',
                asset: signals[0]?.asset || 'UNKNOWN',
                strategy: signals[0]?.strategy || 'UNKNOWN',
                filterType: 'COORDINATION',
            });
        }

        return {
            inputSignals: signals,
            overlayDecisions,
            arbitrationResult,
            finalSignals
        };
    }
}

export const multiStrategySignalCoordinatorService = new MultiStrategySignalCoordinatorService();
