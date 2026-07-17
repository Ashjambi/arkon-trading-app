import { TradingSignal, SignalDirection, SignalStrength, MarketAnalysisState, AppConfig } from '../../types';
import { BaseStrategy } from "./BaseStrategy";
import { calculateInstitutionalRisk } from "./ScoringUtils";
import { calculateNewsShockScore } from './ScoringUtils';

export class NewsShockStrategy implements BaseStrategy {
    validate(state: MarketAnalysisState, config: AppConfig) {
        const score = calculateNewsShockScore(state, config, 'NEWS_SHOCK');
        // Require active event and high score
        const effectiveThreshold = config.hunterMode ? Math.max(0, (config.minSignalScore || 80) - 20) : (config.minSignalScore || 80);
    const passed = score >= effectiveThreshold && !!state.activeEvent;
        return { passed, score };
    }

    execute(state: MarketAnalysisState, config: AppConfig): TradingSignal | null {
        const { passed, score } = this.validate(state, config);
        if (!passed) return null;

        // Follow the order flow imbalance during news
        const direction = state.liquidityGap > 0 ? SignalDirection.LONG : SignalDirection.SHORT;
      const risk = calculateInstitutionalRisk(state, direction, 'BREAKOUT');
      
      return {
            id: `NEWS-${state.asset}-${Date.now()}`,
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
            reasoning: `News Shock Event: ${state.activeEvent?.name}. OFI: ${(state.liquidityGap * 100).toFixed(2)}%`,
            strategy: 'NEWS_SHOCK',
            details: {
                volumeMultiplier: 1.5, // Aggressive sizing for news shocks
                fundingRate: state.fundingRate,
                correlationScore: state.rSquared,
                fisher: state.fisher,
                volatilityPremium: state.dvol,
                statisticalEdge: score,
                quantRegime: state.regime,
                vwap: state.price / (1 + state.vwapDeviation),
                vwapDeviation: state.vwapDeviation,
                hurstExponent: state.hurst
            }
        };

    }
}
