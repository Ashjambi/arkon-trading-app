import {
  TradingSignal,
  SignalDirection,
  SignalStrength,
  MarketAnalysisState,
  AppConfig,
} from "../../../types";
import { BaseStrategy } from "../BaseStrategy";
import { calculateTrendScore, calculateInstitutionalRisk } from "../ScoringUtils";

export class ETHTrendStrategy implements BaseStrategy {
  validate(state: MarketAnalysisState, config: AppConfig) {
    let score = calculateTrendScore(state, config, "ETH_TREND");

    const isRightRegime =
      state.regime === "MOMENTUM_TREND" || state.regime === "HIGH_VOLATILITY";
    if (!isRightRegime) {
      score *= 1.0; // Minor penalty instead of 0.5
    }

    const effectiveThreshold = config.hunterMode ? Math.max(0, (config.minSignalScore || 80) - 20) : (config.minSignalScore || 80);
    const passed = score >= effectiveThreshold;

    return { passed, score };
  }

  execute(state: MarketAnalysisState, config: AppConfig): TradingSignal | null {
    const { passed, score } = this.validate(state, config);
    if (passed) {
      const direction = state.trendDirection === "UP" ? SignalDirection.LONG : SignalDirection.SHORT;
      const risk = calculateInstitutionalRisk(state, direction, 'TREND');
      
      return {
        id: `ETH_TREND-${Date.now()}`,
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
        reasoning: "ETH Trend Following Strategy - Dynamic Institutional Risk",
        strategy: "ETH_TREND",
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
          hurstExponent: state.hurst,
        },
      };
    }
    return null;
  }
}
