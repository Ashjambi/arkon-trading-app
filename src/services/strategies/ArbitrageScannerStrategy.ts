import {
  TradingSignal,
  SignalDirection,
  SignalStrength,
  MarketAnalysisState,
  AppConfig,
} from '../../types';
import { BaseStrategy } from './BaseStrategy';
import { calculateInstitutionalRisk } from './ScoringUtils';

export class ArbitrageScannerStrategy implements BaseStrategy {
  validate(state: MarketAnalysisState, config: AppConfig): { passed: boolean; score: number; reason?: string } {
    const spreadProxy = Math.abs(state.vwapDeviation);
    const correlationEdge = Math.max(0, Math.min(1, state.rSquared));
    const liquidityQuality = Math.max(0, Math.min(1, state.volRatio / 2));
    const toxicityPenalty = Math.max(0, Math.min(1, state.toxicityScore));

    let score = spreadProxy * 4000 * 0.45 + correlationEdge * 100 * 0.35 + liquidityQuality * 100 * 0.2;
    score -= toxicityPenalty * 25;
    score = Math.max(0, Math.min(100, score));

    const spreadOk = spreadProxy >= 0.008;
    const correlationOk = state.rSquared >= 0.45;
    const microstructureOk = state.toxicityScore <= (config.toxicity || 0.8) * 1.2;

    const effectiveThreshold = config.hunterMode
      ? Math.max(0, (config.minSignalScore || 80) - 20)
      : (config.minSignalScore || 80);

    const passed = score >= effectiveThreshold && spreadOk && correlationOk && microstructureOk;
    const reason = passed ? undefined : 'ARBITRAGE_WINDOW_NOT_READY';

    return { passed, score, reason };
  }

  execute(state: MarketAnalysisState, config: AppConfig): TradingSignal | null {
    const { passed, score } = this.validate(state, config);
    if (!passed) return null;

    const direction = state.vwapDeviation > 0 ? SignalDirection.SHORT : SignalDirection.LONG;
    const risk = calculateInstitutionalRisk(state, direction, 'MEAN_REV');

    return {
      id: `ARBITRAGE_SCANNER-${Date.now()}`,
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
      reasoning: 'Arbitrage Scanner: cross-venue spread proxy detected with controlled execution risk.',
      strategy: 'ARBITRAGE_SCANNER',
      details: {
        volumeMultiplier: Math.max(1, state.volRatio),
        fundingRate: state.fundingRate,
        correlationScore: state.rSquared,
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
