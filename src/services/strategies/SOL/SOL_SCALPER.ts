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
 * SOL_SCALPER — استراتيجية سكالبينج سولانا عالية التردد
 * 
 * Solana scalping is very profitable due to:
 * - High volatility (5-15% daily moves)
 * - Tight spreads on Binance (0.01-0.02%)
 * - High retail volume = many liquidity sweeps
 * - Strong mean reversion after sweeps
 * 
 * Scalping مقاييس:
 * - Target: $0.10-$0.50 per SOL
 * - Stop: $0.20-$0.40
 * - Best during US market hours
 * - Requires strong order flow confirmation
 * - Can scale up to 20 concurrent positions (high liquidity)
 */
export class SolScalperStrategy implements BaseStrategy {
  validate(state: MarketAnalysisState, config: AppConfig) {
    let score = 0;
    let direction: SignalDirection | null = null;

    const vwapZScore = state.vwapZScore || 0;
    const isDeepOversold = state.fisher < -0.2 || vwapZScore < -0.5;
    const isDeepOverbought = state.fisher > 0.2 || vwapZScore > 0.5;
    
    const isVolumeSpike = state.volRatio > 1.0;
    const orderFlowConfirmLong = state.liquidityGap > 0.03;
    const orderFlowConfirmShort = state.liquidityGap < -0.03;

    let longScore = 30;  // Higher base for SOL (active market)
    let shortScore = 30;

    // 1. Mean Reversion from Extremes (key for SOL scalping)
    if (isDeepOversold) longScore += 45;
    if (isDeepOverbought) shortScore += 45;

    // 2. Liquidity sweeps (SOL has frequent stop runs)
    if (state.bullishSweep) longScore += 30;
    if (state.bearishSweep) shortScore += 30;

    // 3. Volume & Order Flow
    if (isVolumeSpike) {
      if (state.trendDirection === "UP" || orderFlowConfirmLong) longScore += 20;
      if (state.trendDirection === "DOWN" || orderFlowConfirmShort) shortScore += 20;
    }

    // 4. Momentum alignment
    if (state.trendDirection === "UP" && state.fisher > 0) longScore += 15;
    if (state.trendDirection === "DOWN" && state.fisher < 0) shortScore += 15;

    // 5. ADR exhaustion (SOL often reverses after hitting daily range)
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
    let reason = passed ? 'SOL score threshold met' : 'SOL score too low';

    // SOL-specific: require order flow alignment in trending regimes
    if (passed && direction && state.regime === "MOMENTUM_TREND") {
      const trendAligned = 
        (direction === SignalDirection.LONG && state.trendDirection === "UP") ||
        (direction === SignalDirection.SHORT && state.trendDirection === "DOWN");
      
      if (!trendAligned) {
        passed = false;
        reason = 'SOL scalper: counter-trend in momentum regime';
      }
    }

    return { passed, score, direction, reason };
  }

  execute(state: MarketAnalysisState, config: AppConfig): TradingSignal | null {
    const { passed, score, direction } = this.validate(state, config);
    if (passed && direction) {
      const risk = calculateInstitutionalRisk(state, direction, 'SCALPER');

      return {
        id: `SOL_SCALPER-${Date.now()}`,
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
        reasoning: "SOL Scalper — High-beta liquidity sweep with microstructure confirmation",
        strategy: "SOL_SCALPER",
        details: {
          volumeMultiplier: 1.0,
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
