import { TradingSignal, SignalDirection } from '../types';
import { strategyRegistryService } from './StrategyRegistryService';
import { diagnosticsService } from './DiagnosticsService';

export interface OverlayDecision {
    originalSignal: TradingSignal;
    adjustedSizeFactor: number;
    suppressed: boolean;
    suppressionReason?: string;
    overlayNotes?: string[];
    crowdingRisk?: 'LOW' | 'MEDIUM' | 'HIGH';
    concentrationRisk?: 'LOW' | 'MEDIUM' | 'HIGH';
    regimeConflict?: boolean;
    executionRisk?: 'LOW' | 'MEDIUM' | 'HIGH';
}

export class PortfolioRiskOverlayService {
    public config = {
        maxConcurrentStrategiesPerAsset: 2,
        maxSimilarThemeSignals: 1,
        maxDirectionalBiasPerAsset: 2
    };

    public strategyWeights: Record<string, number> = {};

    constructor() {}

    public evaluateSignals(signals: TradingSignal[]): OverlayDecision[] {
        const groupedByAsset: Record<string, TradingSignal[]> = {};
        for (const s of signals) {
            if (!groupedByAsset[s.asset]) {
                groupedByAsset[s.asset] = [];
            }
            groupedByAsset[s.asset].push(s);
        }

        const decisions: OverlayDecision[] = [];

        for (const asset of Object.keys(groupedByAsset)) {
            const assetSignals = groupedByAsset[asset];
            
            const enriched = assetSignals.map(signal => {
                const meta = strategyRegistryService.getStrategyMeta(signal.strategy) || {
                    strategyId: signal.strategy,
                    style: 'Unknown',
                    assetScope: [signal.asset],
                    enabled: true,
                    priorityWeight: 1,
                    thematicGroup: 'Unknown'
                };
                
                const weight = this.strategyWeights[signal.strategy] !== undefined 
                    ? this.strategyWeights[signal.strategy] 
                    : meta.priorityWeight;
                
                return { signal, meta, weight, score: (signal.qualityScore || 50) * weight };
            });

            enriched.sort((a, b) => b.score - a.score);

            const activeThemes = new Set<string>();
            let longs = 0;
            let shorts = 0;
            let acceptedForAsset = 0;

            for (const { signal, meta, weight } of enriched) {
                const crowdingRisk = acceptedForAsset >= this.config.maxConcurrentStrategiesPerAsset - 1 ? 'HIGH' : 'MEDIUM';
                const concentrationRisk = signal.direction === SignalDirection.LONG && longs >= this.config.maxDirectionalBiasPerAsset ? 'HIGH' : 'MEDIUM';
                const regimeConflict = activeThemes.has(meta.thematicGroup) || (signal.direction === SignalDirection.LONG && longs > 0 && (signal.direction as SignalDirection) === SignalDirection.SHORT);
                const executionRisk = (signal.qualityScore || 50) < 60 ? 'HIGH' : 'MEDIUM';
                const decision: OverlayDecision = {
                    originalSignal: signal,
                    adjustedSizeFactor: weight,
                    suppressed: false,
                    overlayNotes: [],
                    crowdingRisk,
                    concentrationRisk: concentrationRisk as any,
                    regimeConflict,
                    executionRisk: executionRisk as any
                };

                if (acceptedForAsset >= this.config.maxConcurrentStrategiesPerAsset) {
                    decision.suppressed = true;
                    decision.suppressionReason = 'SUPPRESSED_PORTFOLIO_CROWDING';
                    decision.overlayNotes!.push('Max strategies per asset reached');
                } else if (activeThemes.has(meta.thematicGroup)) {
                    decision.suppressed = true;
                    decision.suppressionReason = 'SUPPRESSED_THEME_DUPLICATION';
                    decision.overlayNotes!.push(`Duplicate theme: ${meta.thematicGroup}`);
                } else {
                    const willExceedLong = signal.direction === 'LONG' && longs >= this.config.maxDirectionalBiasPerAsset;
                    const willExceedShort = signal.direction === 'SHORT' && shorts >= this.config.maxDirectionalBiasPerAsset;
                    
                    if (willExceedLong || willExceedShort) {
                        decision.suppressed = true;
                        decision.suppressionReason = 'SUPPRESSED_LOW_PRIORITY';
                        decision.overlayNotes!.push('Directional bias limit reached');
                    }
                }

                if (!decision.suppressed) {
                    acceptedForAsset++;
                    activeThemes.add(meta.thematicGroup);
                    if (signal.direction === 'LONG') longs++;
                    else if (signal.direction === 'SHORT') shorts++;
                }

                if (decision.suppressed) {
                    decision.crowdingRisk = 'HIGH';
                    decision.concentrationRisk = 'HIGH';
                    decision.executionRisk = 'HIGH';
                    decision.regimeConflict = true;
                }

                (decision.originalSignal as any).crowdingRisk = decision.crowdingRisk;
                (decision.originalSignal as any).concentrationRisk = decision.concentrationRisk;
                (decision.originalSignal as any).regimeConflict = decision.regimeConflict;
                (decision.originalSignal as any).executionRisk = decision.executionRisk;

                diagnosticsService.recordOverlayDecision(
                    signal.strategy,
                    decision.suppressed,
                    decision.suppressionReason
                );

                decisions.push(decision);
            }
        }

        return decisions;
    }
}

export const portfolioRiskOverlayService = new PortfolioRiskOverlayService();
