import {
  TradingSignal,
  SignalDirection,
  SignalStrength,
  MarketAnalysisState,
  AppConfig,
} from "../../../types";
import { BaseStrategy } from "../BaseStrategy";
import {  calculateScalpScore , calculateInstitutionalRisk } from "../ScoringUtils";

export class BTCOFIStrategy implements BaseStrategy {
  validate(state: MarketAnalysisState, config: AppConfig) {
    const score = calculateScalpScore(state, config, "BTC_OFI");

    const hasSignal = state.orderFlowSignal !== null;
    const effectiveThreshold = config.hunterMode ? Math.max(0, (config.minSignalScore || 80) - 20) : (config.minSignalScore || 80);
    const passed = score >= effectiveThreshold && hasSignal;

    return { passed, score };
  }

  execute(state: MarketAnalysisState, config: AppConfig): TradingSignal | null {
    const { passed, score } = this.validate(state, config);
    if (passed) {
      const direction = state.orderFlowSignal === "BUY_SIGNAL"
            ? SignalDirection.LONG
            : SignalDirection.SHORT;
      const risk = calculateInstitutionalRisk(state, direction, 'SCALPER');
      
      return {
        id: `BTC_OFI-${Date.now()}`,
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
        reasoning: "BTC Order Flow Imbalance Strategy",
        strategy: "BTC_OFI",
        details: {
          volumeMultiplier: 1,
          fundingRate: state.fundingRate,
          correlationScore: state.liquidityGap,
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
