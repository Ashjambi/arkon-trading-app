import {
  TradingSignal,
  SignalDirection,
  SignalStrength,
  MarketAnalysisState,
  AppConfig,
} from '../../types';
import { BaseStrategy } from './BaseStrategy';
import { calculateInstitutionalRisk, calculateMeanRevScore } from './ScoringUtils';

export class MeanReversionAlphaStrategy implements BaseStrategy {
  validate(state: MarketAnalysisState, config: AppConfig): { passed: boolean; score: number; reason?: string } {
    let score = calculateMeanRevScore(state, config, 'MEAN_REVERSION_ALPHA');

    const isRegimeFit = state.regime === 'MEAN_REVERSION' || state.regime === 'CHOPPY/NOISE' || state.regime === 'LOW_VOLATILITY';
    const hasDeviation = Math.abs(state.vwapDeviation) >= 0.004;

    if (!isRegimeFit) score -= 20;
    if (!hasDeviation) score -= 15;

    score = Math.max(0, Math.min(100, score));

    const effectiveThreshold = config.hunterMode
      ? Math.max(0, (config.minSignalScore || 80) - 20)
      : (config.minSignalScore || 80);

    const passed = score >= effectiveThreshold && isRegimeFit && hasDeviation;
    const reason = passed ? undefined : 'MEAN_REVERSION_CONDITIONS_NOT_MET';

    return { passed, score, reason };
  }

  execute(state: MarketAnalysisState, config: AppConfig): TradingSignal | null {
    const { passed, score } = this.validate(state, config);
    if (!passed) return null;

    const direction = state.vwapDeviation > 0 ? SignalDirection.SHORT : SignalDirection.LONG;
    const risk = calculateInstitutionalRisk(state, direction, 'MEAN_REV');

    return {
      id: `MEAN_REVERSION_ALPHA-${Date.now()}`,
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
      reasoning: 'Mean Reversion Alpha: fade statistically stretched price around VWAP mean.',
      strategy: 'MEAN_REVERSION_ALPHA',
      details: {
        volumeMultiplier: 1,
        fundingRate: state.fundingRate,
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
}
