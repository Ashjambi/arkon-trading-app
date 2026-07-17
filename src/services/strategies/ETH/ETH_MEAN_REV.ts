import {
  TradingSignal,
  SignalDirection,
  SignalStrength,
  MarketAnalysisState,
  AppConfig,
} from "../../../types";
import { BaseStrategy } from "../BaseStrategy";
import {  calculateMeanRevScore , calculateInstitutionalRisk } from "../ScoringUtils";

export class ETHMeanRevStrategy implements BaseStrategy {
  validate(state: MarketAnalysisState, config: AppConfig) {
    let score = calculateMeanRevScore(state, config, "ETH_MEAN_REV");

    const isRightRegime =
      state.regime === "MEAN_REVERSION" || state.regime === "CHOPPY/NOISE";
    if (!isRightRegime) {
      score *= 1.0; // Penalize score if wrong regime
    }

    const effectiveThreshold = config.hunterMode ? Math.max(0, (config.minSignalScore || 80) - 20) : (config.minSignalScore || 80);
    const passed = score >= effectiveThreshold;

    return { passed, score };
  }

  execute(state: MarketAnalysisState, config: AppConfig): TradingSignal | null {
    const { passed, score } = this.validate(state, config);
    if (passed) {
      const direction = state.fisher > 0 ? SignalDirection.SHORT : SignalDirection.LONG;
      const risk = calculateInstitutionalRisk(state, direction, 'MEAN_REV');
      
      return {
        id: `ETH_MEAN_REV-${Date.now()}`,
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
        reasoning: "ETH Mean Reversion Strategy",
        strategy: "ETH_MEAN_REV",
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
