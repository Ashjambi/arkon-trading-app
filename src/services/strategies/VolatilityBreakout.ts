import { TradingSignal, SignalDirection, SignalStrength, MarketAnalysisState, AppConfig } from '../../types';
import { BaseStrategy } from "./BaseStrategy";
import { calculateInstitutionalRisk } from "./ScoringUtils";
import { calculateBreakoutScore } from './ScoringUtils';

export class VolatilityBreakoutStrategy implements BaseStrategy {
    validate(state: MarketAnalysisState, config: AppConfig) {
        const score = calculateBreakoutScore(state, config, 'VOLATILITY_BREAKOUT');
        
        const isBreakout = state.price > state.yearlyHigh || state.price < state.yearlyLow;
        const effectiveThreshold = config.hunterMode ? Math.max(0, (config.minSignalScore || 80) - 20) : (config.minSignalScore || 80);
    const passed = score >= effectiveThreshold && isBreakout; // Strict threshold + breakout condition
        
        return { passed, score };
    }

    execute(state: MarketAnalysisState, config: AppConfig): TradingSignal | null {
        const { passed, score } = this.validate(state, config);
        if (passed) {
            const direction = state.price > state.yearlyHigh ? SignalDirection.LONG : SignalDirection.SHORT;
            
      const risk = calculateInstitutionalRisk(state, direction, 'BREAKOUT');
      
      return {
                id: `VOL_BREAKOUT-${Date.now()}`,
                timestamp: Date.now(),
                asset: state.asset,
                direction,
                strength: SignalStrength.STRONG,
                entry: state.price,
                stopLoss: risk.stopLoss,
                takeProfit: risk.takeProfit,
                tp1: risk.tp1,
                tp2: risk.tp2,
                qualityScore: score,
                reasoning: `Volatility Breakout: Price broke ${direction === SignalDirection.LONG ? 'yearly high' : 'yearly low'} with high volume.`,
                strategy: 'VOLATILITY_BREAKOUT',
                details: {
                    volumeMultiplier: 1,
                    fundingRate: state.fundingRate,
                    correlationScore: 0,
                    fisher: state.fisher,
                    volatilityPremium: state.dvol,
                    statisticalEdge: score,
                    quantRegime: state.regime,
                    vwap: 0,
                    vwapDeviation: state.vwapDeviation,
                    hurstExponent: state.hurst
                }
            };

        }
        return null;
    }
}
