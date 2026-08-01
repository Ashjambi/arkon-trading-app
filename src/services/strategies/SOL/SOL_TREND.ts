import {
  TradingSignal,
  SignalDirection,
  SignalStrength,
  MarketAnalysisState,
  AppConfig,
} from "../../../types";
import { BaseStrategy } from "../BaseStrategy";
import { calculateTrendScore, calculateInstitutionalRisk } from "../ScoringUtils";

/**
 * SOL_TREND — استراتيجية تتبع اتجاه سولانا
 * 
 * Solana (SOL) characteristics:
 * - Higher volatility than BTC/ETH (DVOL 80-120)
 * - Strong momentum with retail/VC narratives
 * - Correlated to BTC but with higher beta (1.5-2x)
 * - Active DePIN and meme ecosystem driving volume
 * - High funding rates in bull runs
 * 
 * مقاييس خاصة بـ SOL:
 * - DVOL > 60 → طبيعي لسولانا
 * - DVOL > 100 → مرتفع، مناسب للانكسار
 * - ADR: 5-8% يومياً (أعلى من BTC 2-3%)
 * - حجم التداول: غالباً أعلى من ETH في فترات النشاط
 */
export class SolTrendStrategy implements BaseStrategy {
  validate(
    state: MarketAnalysisState,
    config: AppConfig,
  ): { passed: boolean; score: number; reason?: string } {
    // Solana-specific gate overrides: higher volatility regime
    const solGates = {
      ...(config.strategyGates?.SOL_TREND || {}),
      hurst: 0.52,       // SOL trends strongly
      fisher: 1.0,       // Higher Fisher for SOL
      rSquared: 0.3,     // Higher R² needed
      dvol: 40,          // SOL DVOL naturally high
      toxicity: 0.8,     // More tolerant of toxicity
      slippage: 0.001,   // SOL can have slippage
      vwapZScore: 1.5,   // SOL needs bigger VWAP deviation
      volRatio: 1.0,     // Higher volume ratio
    };

    let score = calculateTrendScore(
      { ...state, dvol: Math.max(state.dvol, 40) }, 
      { ...config, strategyGates: { ...config.strategyGates, SOL_TREND: solGates } as any }, 
      "SOL_TREND"
    );

    // SOL trends in momentum regimes
    const isRightRegime =
      state.regime === "MOMENTUM_TREND" || 
      state.regime === "HIGH_VOLATILITY";
    
    if (!isRightRegime) {
      score *= 0.85;
    }

    // SOL trend bonus: high funding rate = strong trend
    if (state.fundingRate > 0.01) {
      score += 15; // Funding confirms bullish trend
    }

    const effectiveThreshold = config.hunterMode 
      ? Math.max(0, (config.minSignalScore || 80) - 20) 
      : (config.minSignalScore || 80);
    
    const passed = score >= effectiveThreshold;
    let reason = passed
      ? undefined
      : `SOL score ${score.toFixed(1)} < ${effectiveThreshold}`;

    return { passed, score, reason };
  }

  execute(state: MarketAnalysisState, config: AppConfig): TradingSignal | null {
    const { passed, score } = this.validate(state, config);
    if (passed) {
      const direction = state.trendDirection === "UP" 
        ? SignalDirection.LONG 
        : SignalDirection.SHORT;
      
      const risk = calculateInstitutionalRisk(state, direction, 'TREND');

      return {
        id: `SOL_TREND-${Date.now()}`,
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
        reasoning: "SOL Trend Following — High-beta momentum with risk sizing",
        strategy: "SOL_TREND",
        details: {
          volumeMultiplier: 1.0,
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
