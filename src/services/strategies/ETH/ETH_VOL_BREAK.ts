import {
  TradingSignal,
  SignalDirection,
  SignalStrength,
  MarketAnalysisState,
  AppConfig,
} from "../../../types";
import { BaseStrategy } from "../BaseStrategy";
import {  calculateBreakoutScore , calculateInstitutionalRisk } from "../ScoringUtils";

export class ETHVolBreakStrategy implements BaseStrategy {
  validate(state: MarketAnalysisState, config: AppConfig) {
    let score = calculateBreakoutScore(state, config, "ETH_VOL_BREAK");

    const isRightRegime = state.regime === "HIGH_VOLATILITY";
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
      const direction = state.vwapDeviation > 0
            ? SignalDirection.LONG
            : SignalDirection.SHORT;
      const risk = calculateInstitutionalRisk(state, direction, 'BREAKOUT');
      
      return {
        id: `ETH_VOL_BREAK-${Date.now()}`,
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
        reasoning: "ETH Volatility Breakout Strategy",
        strategy: "ETH_VOL_BREAK",
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
