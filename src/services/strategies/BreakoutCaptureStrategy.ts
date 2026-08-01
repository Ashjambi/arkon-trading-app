import {
  TradingSignal,
  SignalDirection,
  SignalStrength,
  MarketAnalysisState,
  AppConfig,
} from '../../types';
import { BaseStrategy } from './BaseStrategy';
import { calculateInstitutionalRisk, calculateBreakoutScore } from './ScoringUtils';

export class BreakoutCaptureStrategy implements BaseStrategy {
  validate(state: MarketAnalysisState, config: AppConfig): { passed: boolean; score: number; reason?: string } {
    let score = calculateBreakoutScore(state, config, 'BREAKOUT_CAPTURE');

    const bullishBreak = state.price > state.swingHigh * 1.001;
    const bearishBreak = state.price < state.swingLow * 0.999;
    const volumeConfirm = state.volRatio >= 1.15;
    const momentumRegime = state.regime === 'MOMENTUM_TREND' || state.regime === 'HIGH_VOLATILITY';

    if (!volumeConfirm) score -= 20;
    if (!momentumRegime) score -= 15;

    score = Math.max(0, Math.min(100, score));

    const effectiveThreshold = config.hunterMode
      ? Math.max(0, (config.minSignalScore || 80) - 20)
      : (config.minSignalScore || 80);

    const passed = score >= effectiveThreshold && volumeConfirm && (bullishBreak || bearishBreak);
    const reason = passed ? undefined : 'BREAKOUT_CONDITIONS_NOT_MET';
    return { passed, score, reason };
  }

  execute(state: MarketAnalysisState, config: AppConfig): TradingSignal | null {
    const { passed, score } = this.validate(state, config);
    if (!passed) return null;

    const direction = state.price > state.swingHigh ? SignalDirection.LONG : SignalDirection.SHORT;
    const risk = calculateInstitutionalRisk(state, direction, 'BREAKOUT');

    return {
      id: `BREAKOUT_CAPTURE-${Date.now()}`,
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
      reasoning: 'Breakout Capture: enter on structural level break with volume expansion.',
      strategy: 'BREAKOUT_CAPTURE',
      details: {
        volumeMultiplier: Math.max(1, state.volRatio),
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
