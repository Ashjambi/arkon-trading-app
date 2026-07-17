import { TradingSignal } from '../types';
import { strategyRegistryService } from './StrategyRegistryService';
import { diagnosticsService } from './DiagnosticsService';

export interface OverlayDecision {
    originalSignal: TradingSignal;
    adjustedSizeFactor: number;
    suppressed: boolean;
    suppressionReason?: string;
    overlayNotes?: string[];
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
                const decision: OverlayDecision = {
                    originalSignal: signal,
                    adjustedSizeFactor: weight,
                    suppressed: false,
                    overlayNotes: []
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
