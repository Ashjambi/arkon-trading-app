import {
  TradingSignal,
  SignalDirection,
  SignalStrength,
  MarketAnalysisState,
  AppConfig,
} from "../../../types";
import { BaseStrategy } from "../BaseStrategy";
import {  calculateMeanRevScore , calculateInstitutionalRisk } from "../ScoringUtils";

export class ETHCorrArbStrategy implements BaseStrategy {
  validate(state: MarketAnalysisState, config: AppConfig) {
    const score = calculateMeanRevScore(state, config, "ETH_CORR_ARB");

    const effectiveThreshold = config.hunterMode ? Math.max(0, (config.minSignalScore || 80) - 20) : (config.minSignalScore || 80);
    const passed = score >= effectiveThreshold;

    return { passed, score };
  }

  execute(state: MarketAnalysisState, config: AppConfig): TradingSignal | null {
    const { passed, score } = this.validate(state, config);
    if (passed) {
      const direction = state.liquidityGap > 0 ? SignalDirection.SHORT : SignalDirection.LONG;
      const risk = calculateInstitutionalRisk(state, direction, 'MEAN_REV');
      
      return {
        id: `ETH_CORR_ARB-${Date.now()}`,
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
        reasoning: "ETH Correlation Arbitrage Strategy",
        strategy: "ETH_CORR_ARB",
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
