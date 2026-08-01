import { MarketAnalysisState, StrategyType, AppConfig } from '../types';
import { metaStrategyAllocatorService, StrategyAllocationWeight } from './MetaStrategyAllocatorService';

export interface RankedStrategy {
    strat: StrategyType;
    score: number;
    reason: string;
    /** Capital allocation weight from MetaStrategyAllocator (0 = no capital, 1 = normal, 2 = double) */
    weight?: number;
}

export class StrategyOrchestrator {
    private config: AppConfig;

    constructor(config: AppConfig) {
        this.config = config;
    }

    public updateConfig(newConfig: AppConfig) {
        this.config = newConfig;
    }

    private getEnabledStrategies(asset: string): StrategyType[] {
        const baseAsset = asset.split('-')[0];
        const assetStrategies: Record<string, StrategyType[]> = {
            'BTC': ['BTC_TREND', 'BTC_MEAN_REV', 'BTC_OFI', 'BTC_AVR', 'BTC_SCALPER', 'COINTEGRATION', 'MEAN_REVERSION_ALPHA', 'BREAKOUT_CAPTURE', 'ARBITRAGE_SCANNER', 'GRID_TRADING'],
            'ETH': ['ETH_TREND', 'ETH_MEAN_REV', 'ETH_CORR_ARB', 'ETH_VOL_BREAK', 'ETH_SCALPER', 'COINTEGRATION', 'MEAN_REVERSION_ALPHA', 'BREAKOUT_CAPTURE', 'ARBITRAGE_SCANNER', 'GRID_TRADING'],
            'GOLD': ['GOLD_TREND', 'GOLD_MEAN_REV', 'GOLD_SCALPER', 'COINTEGRATION', 'MEAN_REVERSION_ALPHA', 'BREAKOUT_CAPTURE'],
            'SOL': ['SOL_TREND', 'SOL_MEAN_REV', 'SOL_SCALPER', 'VOLATILITY_BREAKOUT', 'BREAKOUT_CAPTURE', 'GRID_TRADING'],
            'XAUUSD': ['GOLD_TREND', 'GOLD_MEAN_REV', 'GOLD_SCALPER'],
            'SOLUSD': ['SOL_TREND', 'SOL_MEAN_REV', 'SOL_SCALPER'],
        };

        const upperAsset = asset.toUpperCase();
        const strategies = assetStrategies[upperAsset] || assetStrategies[baseAsset] || [];
        return strategies.filter(strat => this.config.strategyPerformance[strat]?.isEnabled);
    }

    public getOptimalStrategies(state: MarketAnalysisState): RankedStrategy[] {
        const asset = state.asset.split('-')[0];
        const enabledStrategies = this.getEnabledStrategies(state.asset);

        const isHighVol = state.dvol > 3.0 || state.regime === 'HIGH_VOLATILITY';
        const isTrending = state.regime === 'MOMENTUM_TREND' && Math.abs(state.fisher) > 1.5;
        const isChoppy = state.regime === 'CHOPPY/NOISE' || (state.hurst < 0.45 && state.hurst > 0.35);
        const isMeanReverting = state.regime === 'MEAN_REVERSION' || state.hurst < 0.35;
        const isCointegrationDiverged = state.rSquared > 0.7 && Math.abs(state.vwapDeviation) > 0.01;
        const optimalMarketType = isHighVol || isChoppy ? 'SCALPING' : 'SWING';

        // --- GOLD-SPECIFIC LOGIC ---
        const isGold = asset.toUpperCase() === 'GOLD' || asset.toUpperCase() === 'XAUUSD';
        const goldHurstTrending = state.hurst > 0.55;
        const goldHurstReverting = state.hurst < 0.45;
        const goldAdrExhaustedUp = state.adrExhaustion === 'UP';
        const goldAdrExhaustedDown = state.adrExhaustion === 'DOWN';

        // --- SOL-SPECIFIC LOGIC ---
        const isSol = asset.toUpperCase() === 'SOL' || asset.toUpperCase() === 'SOLUSD';
        const solHurstStrongTrend = state.hurst > 0.6;
        const solHurstChoppy = state.hurst >= 0.45 && state.hurst <= 0.6;
        const solHurstReverting = state.hurst < 0.45;

        const candidates = enabledStrategies.map(strat => {
            const perf = this.config.strategyPerformance[strat];
            if (!perf) return { strat, score: 0, reason: 'No performance data' };

            let score = 50;
            let reason = 'Base';

            if (strat === 'COINTEGRATION' && isCointegrationDiverged) {
                score += 40;
                reason = 'Strong Cointegration Divergence';
            }

            if (perf.totalTrades > 5) {
                score += (perf.winRate - 0.5) * 40;
                score += Math.min(20, (perf.profitFactor - 1) * 10);
                reason += ` | Perf: WR=${perf.winRate.toFixed(2)}`;
            }

            const dailyTrend = state.mtfStatus?.dailyTrend;

            // ===== GOLD-SPECIFIC STRATEGY BIASING =====
            if (isGold) {
                if (strat.includes('TREND') && goldHurstTrending) {
                    score += 45;
                    reason += ' | GOLD: Strong Trend (Hurst>0.55)';
                } else if (strat.includes('TREND') && !goldHurstTrending) {
                    score -= 20;
                    reason += ' | GOLD: Weak Trend (Hurst low)';
                }

                if (strat.includes('MEAN_REV') && goldHurstReverting) {
                    score += 35;
                    reason += ' | GOLD: Strong MR (Hurst<0.45)';
                } else if (strat.includes('MEAN_REV') && !goldHurstReverting) {
                    score -= 15;
                    reason += ' | GOLD: Weak MR (Hurst high)';
                }

                if (strat.includes('SCALPER')) {
                    if (goldHurstReverting || goldAdrExhaustedDown || goldAdrExhaustedUp) {
                        score += 30;
                        reason += ' | GOLD: Scalp favorable (MR or ADR exhausted)';
                    } else if (goldHurstTrending) {
                        score -= 20;
                        reason += ' | GOLD: Scalp weak in trend';
                    }

                    if (goldAdrExhaustedUp || goldAdrExhaustedDown) {
                        score += 15;
                        reason += ' | GOLD: ADR exhaustion scalp boost';
                    }
                }

                if (goldHurstTrending) {
                    if (strat.includes('SCALPER') || strat.includes('MEAN_REV')) {
                        score = Math.min(score, 70);
                    }
                }
            }

            // ===== SOL-SPECIFIC STRATEGY BIASING =====
            if (isSol) {
                if (strat.includes('TREND') && solHurstStrongTrend) {
                    score += 50;
                    reason += ' | SOL: Strong Trend (Hurst>0.6)';
                } else if (strat.includes('TREND') && !solHurstStrongTrend) {
                    score -= 25;
                    reason += ' | SOL: Weak Trend (Hurst<=0.6)';
                }

                if (strat.includes('MEAN_REV') && solHurstChoppy) {
                    score += 25;
                    reason += ' | SOL: MR ok (Hurst 0.45-0.6)';
                } else if (strat.includes('MEAN_REV') && solHurstReverting) {
                    score += 15;
                    reason += ' | SOL: MR possible (Hurst<0.45)';
                } else if (strat.includes('MEAN_REV') && solHurstStrongTrend) {
                    score -= 30;
                    reason += ' | SOL: MR dangerous in strong trend';
                }

                if (strat.includes('SCALPER')) {
                    if (solHurstReverting) {
                        score += 40;
                        reason += ' | SOL: Scalp excellent (Hurst<0.45)';
                    } else if (solHurstChoppy) {
                        score += 20;
                        reason += ' | SOL: Scalp good (choppy)';
                    } else if (solHurstStrongTrend) {
                        score -= 15;
                        reason += ' | SOL: Scalp weak vs trend';
                    }
                }

                if (solHurstStrongTrend) {
                    if (strat.includes('SCALPER') || strat.includes('MEAN_REV')) {
                        score = Math.min(score, 60);
                    }
                }

                if (strat.includes('BREAK') && (isHighVol || state.dvol > 50)) {
                    score += 25;
                    reason += ' | SOL: High vol breakout bonus';
                }
            }

            // ===== GENERIC SCORING (for non-GOLD/SOL assets) =====
            if (!isGold && !isSol) {
                if (perf.type === optimalMarketType) {
                    score += 30;
                    reason += ` | Regime Match (${optimalMarketType})`;
                } else if (isTrending && strat.includes('TREND')) {
                    score += 40;
                    reason += ' | Strong Trend Match';
                } else if (isMeanReverting && strat.includes('MEAN_REV')) {
                    score += 10;
                    reason += ' | Mean Reversion Match';
                } else if (strat.includes('SCALPER') || strat.includes('BREAK')) {
                    score += 45;
                    reason += ' | Priority Quick Profit Match';
                } else {
                    score -= 20;
                }
            }

            // STRICT TREND CONFLICT PREVENTION (applies to non-GOLD/SOL)
            if (!isGold && !isSol) {
                if (dailyTrend === 'UP' && (strat.includes('SCALPER') || strat.includes('BREAK'))) {
                    if (state.vwapDeviation > 0.05) {
                        reason += ' | Overbought Counter-Trend OK';
                    } else {
                        score -= 30;
                        reason += ' | Counter-Trend Penalty';
                    }
                } else if (dailyTrend === 'DOWN' && (strat.includes('SCALPER') || strat.includes('BREAK'))) {
                    if (state.vwapDeviation < -0.05) {
                        reason += ' | Oversold Counter-Trend OK';
                    } else {
                        score -= 30;
                        reason += ' | Counter-Trend Penalty';
                    }
                }
            }

            score = Math.max(0, Math.min(100, score));
            return { strat, score, reason };
        });

        const ranked = candidates.filter(c => c.score >= 20).sort((a, b) => b.score - a.score);

        // Attach capital allocation weights from MetaStrategyAllocatorService
        const allocationWeights = metaStrategyAllocatorService.computeWeightsFromMonitor();
        const weightMap = new Map<string, number>();
        for (const w of allocationWeights) {
            // Key by strategy name (asset-independent for now; the allocator uses asset+strategy)
            weightMap.set(w.strategy, w.weight);
        }

        return ranked.map((r) => ({
            ...r,
            weight: weightMap.get(r.strat) ?? 1.0,
        }));
    }
}
