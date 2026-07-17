import { TradingSignal } from '../types';
import { strategyRegistryService } from './StrategyRegistryService';
import { diagnosticsService } from './DiagnosticsService';

export type ArbitrationDecision = {
    signal: TradingSignal;
    selected: boolean;
    suppressionReason?: string;
    arbitrationNotes?: string[];
    finalScore: number;
};

export type ArbitrationResult = {
    selectedSignals: ArbitrationDecision[];
    suppressedSignals: ArbitrationDecision[];
};

export class StrategyArbitrationService {
    public config = {
        maxSameDirectionSignalsPerAsset: 1,
        minQualityScore: 30
    };

    constructor() {}

    public arbitrate(signals: TradingSignal[]): ArbitrationResult {
        const result: ArbitrationResult = {
            selectedSignals: [],
            suppressedSignals: []
        };

        const groupedByAsset: Record<string, TradingSignal[]> = {};
        for (const s of signals) {
            if (!groupedByAsset[s.asset]) {
                groupedByAsset[s.asset] = [];
            }
            groupedByAsset[s.asset].push(s);
        }

        for (const asset of Object.keys(groupedByAsset)) {
            const assetSignals = groupedByAsset[asset];
            
            // Score and sort signals
            const scoredDecisions: ArbitrationDecision[] = assetSignals.map(signal => {
                const meta = strategyRegistryService.getStrategyMeta(signal.strategy) || {
                    strategyId: signal.strategy,
                    style: 'Unknown',
                    assetScope: [signal.asset],
                    enabled: true,
                    priorityWeight: 1,
                    thematicGroup: 'Unknown'
                };
                
                // Final score calculation
                const finalScore = (signal.qualityScore || 50) * meta.priorityWeight + (signal.strength || 0) * 0.1;
                
                return {
                    signal,
                    selected: false, // Default to false, will be determined
                    finalScore,
                    arbitrationNotes: []
                };
            });

            // Sort by finalScore descending
            scoredDecisions.sort((a, b) => b.finalScore - a.finalScore);

            // Determine if there are conflicting directions
            const hasLong = scoredDecisions.some(d => d.signal.direction === 'LONG');
            const hasShort = scoredDecisions.some(d => d.signal.direction === 'SHORT');
            const hasConflict = hasLong && hasShort;

            let winningDirection: 'LONG' | 'SHORT' | null = null;
            if (hasConflict) {
                // Find highest score for LONG and SHORT
                const bestLong = scoredDecisions.find(d => d.signal.direction === 'LONG');
                const bestShort = scoredDecisions.find(d => d.signal.direction === 'SHORT');
                
                if (bestLong && bestShort) {
                    winningDirection = bestLong.finalScore >= bestShort.finalScore ? 'LONG' : 'SHORT';
                }
            }

            let sameDirectionCount = 0;

            for (const decision of scoredDecisions) {
                if (decision.finalScore < this.config.minQualityScore) {
                    decision.selected = false;
                    decision.suppressionReason = 'SUPPRESSED_DEGRADED_ENVIRONMENT';
                    decision.arbitrationNotes!.push('Signal quality below minimum threshold');
                } else if (hasConflict && decision.signal.direction !== winningDirection) {
                    decision.selected = false;
                    decision.suppressionReason = 'SUPPRESSED_CONFLICTING_SIGNAL';
                    decision.arbitrationNotes!.push('Conflicting direction, weaker signal suppressed');
                } else {
                    if (sameDirectionCount < this.config.maxSameDirectionSignalsPerAsset) {
                        decision.selected = true;
                        sameDirectionCount++;
                    } else {
                        decision.selected = false;
                        decision.suppressionReason = 'SUPPRESSED_LOW_PRIORITY';
                        decision.arbitrationNotes!.push('Lower priority than selected signal for same asset');
                    }
                }

                diagnosticsService.recordArbitrationDecision(
                    decision.signal.strategy,
                    decision.selected,
                    decision.suppressionReason
                );

                if (decision.selected) {
                    result.selectedSignals.push(decision);
                } else {
                    result.suppressedSignals.push(decision);
                }
            }
        }

        return result;
    }
}

export const strategyArbitrationService = new StrategyArbitrationService();
