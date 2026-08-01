import {
  TradingSignal,
  SignalDirection,
  SignalStrength,
  MarketAnalysisState,
  AppConfig,
} from "../../../types";
import { BaseStrategy } from "../BaseStrategy";
import { calculateScalpScore, calculateInstitutionalRisk } from "../ScoringUtils";

/**
 * GOLD_SCALPER — استراتيجية سكالبينج الذهب
 * 
 * Gold scalping is different from crypto:
 * - Gold has very tight spreads (0.1-0.5 pip)
 * - Gold moves in smaller increments (0.01-0.10 per tick)
 * - Target: $0.50-$1.00 per oz (micro moves)
 * - Best during London/NY overlap (high liquidity)
 * - Uses Order Flow + VWAP + Liquidity sweeps
 * 
 * Risk parameters:
 * - Stop: tight ($0.30-0.50)
 * - Target: $0.50-$1.50
 * - Max positions: 10 (gold is less volatile)
 */
export class GoldScalperStrategy implements BaseStrategy {
  validate(state: MarketAnalysisState, config: AppConfig) {
    let score = 0;
    let direction: SignalDirection | null = null;

    // Gold scalper logic
    const vwapZScore = state.vwapZScore || 0;
    const isOversold = state.fisher < -0.1 || vwapZScore < -0.2;
    const isOverbought = state.fisher > 0.1 || vwapZScore > 0.2;
    
    // Gold volume confirmation (lower threshold than crypto)
    const isVolumeSpike = state.volRatio > 0.7;
    const orderFlowConfirmLong = state.liquidityGap > 0.015;
    const orderFlowConfirmShort = state.liquidityGap < -0.015;

    let longScore = 25;  // Base score for gold
    let shortScore = 25;

    // 1. Mean Reversion from VWAP extremes
    if (isOversold) longScore += 40;
    if (isOverbought) shortScore += 40;

    // 2. Liquidity sweeps (gold also has stop hunts)
    if (state.bullishSweep) longScore += 25;
    if (state.bearishSweep) shortScore += 25;

    // 3. Volume confirmation
    if (isVolumeSpike) {
      if (state.trendDirection === "UP" || orderFlowConfirmLong) longScore += 15;
      if (state.trendDirection === "DOWN" || orderFlowConfirmShort) shortScore += 15;
    }

    // 4. ADR exhaustion for gold (gold tends to reverse at daily extremes)
    if (state.adrExhaustion === "DOWN") longScore += 20;
    if (state.adrExhaustion === "UP") shortScore += 20;

    // Determine direction
    if (longScore > shortScore) {
      score = Math.min(100, longScore);
      direction = SignalDirection.LONG;
    } else if (shortScore > longScore) {
      score = Math.min(100, shortScore);
      direction = SignalDirection.SHORT;
    }

    const effectiveThreshold = config.hunterMode 
      ? Math.max(0, (config.minSignalScore || 80) - 20) 
      : (config.minSignalScore || 80);
    
    let passed = score >= effectiveThreshold;
    let reason = passed ? 'Gold score threshold met' : 'Gold score too low';

    // Gold-specific: check for contradictory signals
    if (passed && direction) {
      const isContradictory = 
        (direction === SignalDirection.LONG && state.trendDirection === "DOWN" && orderFlowConfirmShort) ||
        (direction === SignalDirection.SHORT && state.trendDirection === "UP" && orderFlowConfirmLong);

      if (isContradictory) {
        passed = false;
        reason = 'Gold contradictory indicators';
      }
    }

    return { passed, score, direction, reason };
  }

  execute(state: MarketAnalysisState, config: AppConfig): TradingSignal | null {
    const { passed, score, direction } = this.validate(state, config);
    if (passed && direction) {
      const risk = calculateInstitutionalRisk(state, direction, 'SCALPER');

      return {
        id: `GOLD_SCALPER-${Date.now()}`,
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
        reasoning: "GOLD Scalper — Microstructure liquidity sweep with VWAP alignment",
        strategy: "GOLD_SCALPER",
        details: {
          volumeMultiplier: 0.6,
          fundingRate: state.fundingRate || 0,
          correlationScore: state.liquidityGap,
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
