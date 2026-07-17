import {
  TradingSignal,
  SignalDirection,
  SignalStrength,
  MarketAnalysisState,
  AppConfig,
} from "../../../types";
import { BaseStrategy } from "../BaseStrategy";
import {  calculateBreakoutScore , calculateInstitutionalRisk } from "../ScoringUtils";

export class BTCAVRStrategy implements BaseStrategy {
  validate(state: MarketAnalysisState, config: AppConfig) {
    const score = calculateBreakoutScore(state, config, "BTC_AVR");

    const effectiveThreshold = config.hunterMode ? Math.max(0, (config.minSignalScore || 80) - 20) : (config.minSignalScore || 80);
    const passed = score >= effectiveThreshold;

    return { passed, score };
  }

  execute(state: MarketAnalysisState, config: AppConfig): TradingSignal | null {
    const { passed, score } = this.validate(state, config);
    if (passed) {
      const direction = state.regime === "MOMENTUM_TREND"
            ? SignalDirection.LONG
            : SignalDirection.SHORT;
      const risk = calculateInstitutionalRisk(state, direction, 'MEAN_REV');
      
      return {
        id: `BTC_AVR-${Date.now()}`,
        timestamp: Date.now(),
        asset: state.asset,
        direction,
        strength: SignalStrength.MEDIUM,
        entry: state.price,
        stopLoss: risk.stopLoss,
        takeProfit: risk.takeProfit,
        tp1: risk.tp1,
        tp2: risk.tp2,
        qualityScore: score,
        reasoning: "BTC Adaptive Volatility Regime Strategy",
        strategy: "BTC_AVR",
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
