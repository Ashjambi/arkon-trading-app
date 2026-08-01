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
 * GOLD_MEAN_REV — استراتيجية الارتداد لمتوسط الذهب
 * 
 * Gold is naturally mean-reverting in intraday timeframes:
 * - Strong support/resistance at round numbers ($2300, $2350, etc.)
 * - Reverts to VWAP frequently during low-vol Asian/London sessions
 * - Tight stops because gold doesn't spike like crypto
 * 
 * Indicadores específicos:
 * - VWAP deviation: ±0.1% is significant for gold (vs ±0.5% for BTC)
 * - Fisher: |0.5| is already extreme for gold
 * - Hurst: < 0.45 indicates mean reversion
 */
export class GoldMeanRevStrategy implements BaseStrategy {
  validate(
    state: MarketAnalysisState,
    config: AppConfig,
  ): { passed: boolean; score: number; reason?: string } {
    // Gold-specific mean reversion gates
    const goldGates = {
      ...(config.strategyGates?.GOLD_MEAN_REV || {}),
      hurst: 0.5,           // Higher threshold (gold reverts easier)
      fisher: 0.5,          // Lower Fisher threshold for gold
      rSquared: 0.15,
      dvol: 8,
      toxicity: 0.6,
      slippage: 0.0002,
      vwapZScore: 0.5,      // Low VWAP deviation needed for gold
      ofi: 0.05,
      volRatio: 0.6,
    };

    let score = calculateMeanRevScore(
      { ...state, dvol: Math.max(state.dvol, 8) },
      { ...config, strategyGates: { ...config.strategyGates, GOLD_MEAN_REV: goldGates } as any },
      "GOLD_MEAN_REV"
    );

    // Gold is mean-reverting in MEAN_REVERSION, CHOPPY/NOISE, and LOW_VOLATILITY
    const isRightRegime =
      state.regime === "MEAN_REVERSION" || 
      state.regime === "CHOPPY/NOISE" ||
      state.regime === "LOW_VOLATILITY";
    
    if (!isRightRegime) {
      score *= 0.85;
    }

    // Gold-specific: strong VWAP deviation is KEY for mean reversion
    if (Math.abs(state.vwapDeviation) > 0.003) { // 0.3% for gold
      score += 20; // Strong pull-to-VWAP signal
    }

    const effectiveThreshold = config.hunterMode 
      ? Math.max(0, (config.minSignalScore || 80) - 20) 
      : (config.minSignalScore || 80);
    
    const passed = score >= effectiveThreshold;
    let reason = passed
      ? undefined
      : `Gold MR score ${score.toFixed(1)} < ${effectiveThreshold}`;

    return { passed, score, reason };
  }

  execute(state: MarketAnalysisState, config: AppConfig): TradingSignal | null {
    const { passed, score } = this.validate(state, config);
    if (passed) {
      // Gold mean reversion: SHORT when Fisher > 0 (overbought), LONG when Fisher < 0 (oversold)
      const direction = state.fisher > 0 
        ? SignalDirection.SHORT 
        : SignalDirection.LONG;
      
      const risk = calculateInstitutionalRisk(state, direction, 'MEAN_REV');

      return {
        id: `GOLD_MEAN_REV-${Date.now()}`,
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
        reasoning: "GOLD Mean Reversion — VWAP pullback with institutional risk",
        strategy: "GOLD_MEAN_REV",
        details: {
          volumeMultiplier: 0.7,
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
