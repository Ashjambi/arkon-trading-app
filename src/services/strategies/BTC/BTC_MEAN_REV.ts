import {
  TradingSignal,
  SignalDirection,
  SignalStrength,
  MarketAnalysisState,
  AppConfig,
} from "../../../types";
import { BaseStrategy } from "../BaseStrategy";
import {  calculateMeanRevScore , calculateInstitutionalRisk } from "../ScoringUtils";

export class BTCMeanRevStrategy implements BaseStrategy {
  validate(
    state: MarketAnalysisState,
    config: AppConfig,
  ): { passed: boolean; score: number; reason?: string } {
    let score = calculateMeanRevScore(state, config, "BTC_MEAN_REV");

    const isRightRegime =
      state.regime === "MEAN_REVERSION" || state.regime === "CHOPPY/NOISE";
    if (!isRightRegime) {
      score *= 1.0; // Penalize score if wrong regime
    }

    const effectiveThreshold = config.hunterMode ? Math.max(0, (config.minSignalScore || 80) - 20) : (config.minSignalScore || 80);
    const passed = score >= effectiveThreshold;
    let reason = passed
      ? undefined
      : `السكور ${score.toFixed(1)} أقل من 65 أو النظام ${state.regime} غير مناسب`;

    return { passed, score, reason };
  }

  execute(state: MarketAnalysisState, config: AppConfig): TradingSignal | null {
    const { passed, score } = this.validate(state, config);
    if (passed) {
      const direction = state.fisher > 0 ? SignalDirection.SHORT : SignalDirection.LONG;
      const risk = calculateInstitutionalRisk(state, direction, 'MEAN_REV');
      
      return {
        id: `BTC_MEAN_REV-${Date.now()}`,
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
        reasoning: "BTC Mean Reversion Strategy",
        strategy: "BTC_MEAN_REV",
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
