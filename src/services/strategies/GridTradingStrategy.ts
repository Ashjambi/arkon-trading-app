import {
  TradingSignal,
  SignalDirection,
  SignalStrength,
  MarketAnalysisState,
  AppConfig,
} from '../../types';
import { BaseStrategy } from './BaseStrategy';
import { calculateInstitutionalRisk } from './ScoringUtils';

export class GridTradingStrategy implements BaseStrategy {
  validate(state: MarketAnalysisState, config: AppConfig): { passed: boolean; score: number; reason?: string } {
    const sidewaysRegime = state.regime === 'CHOPPY/NOISE' || state.regime === 'LOW_VOLATILITY' || state.regime === 'MEAN_REVERSION';
    const controlledVol = state.dvol >= Math.max(10, (config.dvol || 30) * 0.35) && state.dvol <= Math.max(40, (config.dvol || 60) * 1.15);
    const boundedDeviation = Math.abs(state.vwapDeviation) <= 0.02;

    let score = 40;
    if (sidewaysRegime) score += 25;
    if (controlledVol) score += 20;
    if (boundedDeviation) score += 15;

    if (!sidewaysRegime) score -= 25;
    if (!controlledVol) score -= 20;

    score = Math.max(0, Math.min(100, score));

    const effectiveThreshold = config.hunterMode
      ? Math.max(0, (config.minSignalScore || 80) - 20)
      : (config.minSignalScore || 80);

    const passed = score >= effectiveThreshold && sidewaysRegime && controlledVol;
    const reason = passed ? undefined : 'GRID_MARKET_CONDITIONS_NOT_MET';

    return { passed, score, reason };
  }

  execute(state: MarketAnalysisState, config: AppConfig): TradingSignal | null {
    const { passed, score } = this.validate(state, config);
    if (!passed) return null;

    const direction = state.vwapDeviation > 0 ? SignalDirection.SHORT : SignalDirection.LONG;
    const risk = calculateInstitutionalRisk(state, direction, 'SCALPER');

    return {
      id: `GRID_TRADING-${Date.now()}`,
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
      reasoning: 'Grid Trading: layered entries around mean in sideways regime.',
      strategy: 'GRID_TRADING',
      details: {
        volumeMultiplier: 0.8,
        fundingRate: state.fundingRate,
        correlationScore: 0,
        fisher: state.fisher,
        volatilityPremium: state.dvol,
        statisticalEdge: score,
        quantRegime: state.regime,
        vwap: state.vwapMain,
        vwapDeviation: state.vwapDeviation,
        hurstExponent: state.hurst,
        partialClosePercent: 33,
      },
    };
  }
}
