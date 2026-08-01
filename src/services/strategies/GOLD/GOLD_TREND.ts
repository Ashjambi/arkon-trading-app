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
 * GOLD_TREND — استراتيجية تتبع اتجاه الذهب
 * 
 * Gold (XAUUSD) is a unique asset:
 * - Lower volatility than crypto (DVOL ~10-20 vs 50-80 for BTC)
 * - Strong macro correlation (USD, real yields, geopolitics)
 * - Mean-reverting in short term, trending in medium/long term
 * - No funding rate / open interest from Deribit
 * - Uses Binance XAUUSDT as primary data source
 * 
 * مقاييس خاصة بالذهب:
 * - DVOL < 20 → منخفض التقلب، مناسب للمتوسط
 * - DVOL 20-30 → متوسط، مناسب للترند
 * - DVOL > 30 → مرتفع (نادر للذهب)، مناسب للانكسار
 */
export class GoldTrendStrategy implements BaseStrategy {
  validate(
    state: MarketAnalysisState,
    config: AppConfig,
  ): { passed: boolean; score: number; reason?: string } {
    // Gold-specific gate overrides: lower volatility regime
    const goldGates = {
      ...(config.strategyGates?.GOLD_TREND || {}),
      hurst: 0.48,      // Gold trends smoother → lower threshold
      fisher: 0.8,      // Moderate Fisher for gold
      rSquared: 0.25,   // Lower R² threshold
      dvol: 8,          // Gold DVOL typically 10-20
      toxicity: 0.6,    // Gold less toxic
      slippage: 0.0002, // Gold is liquid
      vwapZScore: 0.8,  // Lower VWAP deviation for gold
      volRatio: 0.6,    // Lower volume ratio
    };

    // Calculate score using gold-specific gates
    let score = calculateTrendScore(
      { ...state, dvol: Math.max(state.dvol, 8) }, 
      { ...config, strategyGates: { ...config.strategyGates, GOLD_TREND: goldGates } as any }, 
      "GOLD_TREND"
    );

    // Gold regime: trends are smoother, allow in LOW_VOLATILITY too
    const isRightRegime =
      state.regime === "MOMENTUM_TREND" || 
      state.regime === "HIGH_VOLATILITY" ||
      state.regime === "LOW_VOLATILITY";  // Gold can trend in low vol too
    
    if (!isRightRegime) {
      score *= 0.9; // Small penalty for wrong regime
    }

    // Gold macro overlay: check if Fisher is moderate
    if (Math.abs(state.fisher) > 2.0) {
      score *= 0.8; // Extreme Fisher → gold is extended, reduce score
    }

    const effectiveThreshold = config.hunterMode 
      ? Math.max(0, (config.minSignalScore || 80) - 20) 
      : (config.minSignalScore || 80);
    
    const passed = score >= effectiveThreshold;
    let reason = passed
      ? undefined
      : `Gold score ${score.toFixed(1)} < ${effectiveThreshold}`;

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
        id: `GOLD_TREND-${Date.now()}`,
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
        reasoning: "GOLD Trend Following — Gold macro trend with institutional risk management",
        strategy: "GOLD_TREND",
        details: {
          volumeMultiplier: 0.8, // Gold: smaller positions due to lower volatility
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
