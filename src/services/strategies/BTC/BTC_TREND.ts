import {
  TradingSignal,
  SignalDirection,
  SignalStrength,
  MarketAnalysisState,
  AppConfig,
} from "../../../types";
import { BaseStrategy } from "../BaseStrategy";
import { calculateTrendScore, calculateInstitutionalRisk } from "../ScoringUtils";

export class BTCTrendStrategy implements BaseStrategy {
  validate(
    state: MarketAnalysisState,
    config: AppConfig,
  ): { passed: boolean; score: number; reason?: string } {
    let score = calculateTrendScore(state, config, "BTC_TREND");

    // Dynamic Regime Logic - Allow trend following even in choppy if score is very high
    const isRightRegime =
      state.regime === "MOMENTUM_TREND" || state.regime === "HIGH_VOLATILITY";
    if (!isRightRegime) {
      score *= 1.0; // Minor penalty instead of harsh 0.5 penalty
    }

    const effectiveThreshold = config.hunterMode ? Math.max(0, (config.minSignalScore || 80) - 20) : (config.minSignalScore || 80);
    const passed = score >= effectiveThreshold;
    let reason = passed
      ? undefined
      : `السكور ${score.toFixed(1)} أقل من ${effectiveThreshold}`;

    return { passed, score, reason };
  }

  execute(state: MarketAnalysisState, config: AppConfig): TradingSignal | null {
    const { passed, score } = this.validate(state, config);
    if (passed) {
      const direction = state.trendDirection === "UP" ? SignalDirection.LONG : SignalDirection.SHORT;
      const risk = calculateInstitutionalRisk(state, direction, 'TREND');

      return {
        id: `BTC_TREND-${Date.now()}`,
        timestamp: Date.now(),
        asset: state.asset,
        direction,
        strength: score > 90 ? SignalStrength.STRONG : SignalStrength.STANDARD,
        entry: state.price,
        stopLoss: risk.stopLoss,
        takeProfit: risk.takeProfit,
        tp1: risk.tp1,
        tp2: risk.tp2,
        qualityScore: score,
        reasoning: "BTC Trend Following Strategy - Dynamic Institutional Risk",
        strategy: "BTC_TREND",
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
