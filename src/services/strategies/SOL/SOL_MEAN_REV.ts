import {
  TradingSignal,
  SignalDirection,
  SignalStrength,
  MarketAnalysisState,
  AppConfig,
} from "../../../types";
import { BaseStrategy } from "../BaseStrategy";
import { calculateMeanRevScore, calculateInstitutionalRisk } from "../ScoringUtils";

/**
 * SOL_MEAN_REV — استراتيجية الارتداد لمتوسط سولانا
 * 
 * Solana mean reversion is riskier than BTC/ETH:
 * - SOL can deviate from VWAP by 2-5% before reverting
 * - Sharp corrections happen fast (-10% in minutes)
 * - Best used during CHOPPY/NOISE regimes
 * - Position sizing must be conservative
 * 
 * Indicadores:
 * - VWAP deviation: ±1.5% for SOL
 * - Fisher: |2.0| for SOL
 * - Hurst: < 0.45
 * - Must see order flow reversal confirmation
 */
export class SolMeanRevStrategy implements BaseStrategy {
  validate(
    state: MarketAnalysisState,
    config: AppConfig,
  ): { passed: boolean; score: number; reason?: string } {
    // Solana-specific mean reversion gates
    const solGates = {
      ...(config.strategyGates?.SOL_MEAN_REV || {}),
      hurst: 0.48,
      fisher: 1.5,
      rSquared: 0.2,
      dvol: 40,
      toxicity: 0.7,
      slippage: 0.001,
      vwapZScore: 1.5,
      ofi: 0.1,
      volRatio: 0.8,
    };

    let score = calculateMeanRevScore(
      { ...state, dvol: Math.max(state.dvol, 40) },
      { ...config, strategyGates: { ...config.strategyGates, SOL_MEAN_REV: solGates } as any },
      "SOL_MEAN_REV"
    );

    // SOL mean reversion works in CHOPPY and MEAN_REVERSION regimes
    const isRightRegime =
      state.regime === "MEAN_REVERSION" || 
      state.regime === "CHOPPY/NOISE";
    
    if (!isRightRegime) {
      score *= 0.7; // Harsh penalty for trending regimes
    }

    // SOL safety: require order flow confirmation for MEAN REV
    if (state.liquidityGap !== undefined && Math.abs(state.liquidityGap) < 0.05) {
      score -= 20; // No strong order flow = risky mean reversion
    }

    const effectiveThreshold = config.hunterMode 
      ? Math.max(0, (config.minSignalScore || 80) - 20) 
      : (config.minSignalScore || 80);
    
    const passed = score >= effectiveThreshold;
    let reason = passed
      ? undefined
      : `SOL MR score ${score.toFixed(1)} < ${effectiveThreshold}`;

    return { passed, score, reason };
  }

  execute(state: MarketAnalysisState, config: AppConfig): TradingSignal | null {
    const { passed, score } = this.validate(state, config);
    if (passed) {
      const direction = state.fisher > 0 
        ? SignalDirection.SHORT 
        : SignalDirection.LONG;
      
      const risk = calculateInstitutionalRisk(state, direction, 'MEAN_REV');

      return {
        id: `SOL_MEAN_REV-${Date.now()}`,
        timestamp: Date.now(),
        asset: state.asset,
        direction,
        strength: SignalStrength.STANDARD,
        entry: state.price,
        stopLoss: risk.stopLoss,
        takeProfit: risk.takeProfit,
        tp1: risk.tp1,
        tp2: risk.tp2,
        qualityScore: score,
        reasoning: "SOL Mean Reversion — VWAP pullback with order flow confirmation",
        strategy: "SOL_MEAN_REV",
        details: {
          volumeMultiplier: 0.8,
          fundingRate: state.fundingRate || 0,
          correlationScore: 0,
          fisher: state.fisher,
          volatilityPremium: state.dvol,
          statisticalEdge: score,
          quantRegime: state.regime,
          vwap: state.vwapMain,
          vwapDeviation: state.vwapDeviation,
          hurstExponent: state.hurst,
        },
      };
    }
    return null;
  }
}
