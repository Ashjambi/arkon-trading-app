import { MarketAnalysisState, StrategyType, AppConfig } from '../types';

export interface RankedStrategy {
    strat: StrategyType;
    score: number;
    reason: string;
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
            'BTC': ['BTC_TREND', 'BTC_MEAN_REV', 'BTC_OFI', 'BTC_AVR', 'BTC_SCALPER', 'COINTEGRATION'],
            'ETH': ['ETH_TREND', 'ETH_MEAN_REV', 'ETH_CORR_ARB', 'ETH_VOL_BREAK', 'ETH_SCALPER', 'COINTEGRATION'],
        };
        const strategies = assetStrategies[baseAsset] || [];
        return strategies.filter(strat => this.config.strategyPerformance[strat]?.isEnabled);
    }

    public getOptimalStrategies(state: MarketAnalysisState): RankedStrategy[] {
        const asset = state.asset.split('-')[0];
        const enabledStrategies = this.getEnabledStrategies(state.asset);

        // Market Context Analysis
        const isHighVol = state.dvol > 3.0 || state.regime === 'HIGH_VOLATILITY';
        const isTrending = state.regime === 'MOMENTUM_TREND' && Math.abs(state.fisher) > 1.5;
        const isChoppy = state.regime === 'CHOPPY/NOISE' || (state.hurst < 0.45 && state.hurst > 0.35);
        const isMeanReverting = state.regime === 'MEAN_REVERSION' || state.hurst < 0.35;
        const isCointegrationDiverged = state.rSquared > 0.7 && Math.abs(state.vwapDeviation) > 0.01;
        const optimalMarketType = isHighVol || isChoppy ? 'SCALPING' : 'SWING';

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

            const dailyTrend = state.mtfStatus?.dailyTrend; // e.g., 'UP' or 'DOWN'

            if (perf.type === optimalMarketType) {
                score += 30;
                reason += ` | Regime Match (${optimalMarketType})`;
            } else if (isTrending && strat.includes('TREND')) {
                score += 40;
                reason += ' | Strong Trend Match';
            } else if (isMeanReverting && strat.includes('MEAN_REV')) {
                score += 10; // Reduced to give priority to other strategies
                reason += ' | Mean Reversion Match';
            } else if (strat.includes('SCALPER') || strat.includes('BREAK')) {
                score += 45; // Boost Scalper and Breakout for quick profits
                reason += ' | Priority Quick Profit Match';
            } else {
                score -= 20;
            }
            
            // STRICT TREND CONFLICT PREVENTION:
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

            // No cooldown for continuous profit generation
            if (perf.consecutiveLosses >= 3) {
                 // removed penalty 
            }

            score = Math.max(0, Math.min(100, score));
            return { strat, score, reason };
        });

        return candidates.filter(c => c.score >= 20).sort((a, b) => b.score - a.score);
    }
}
