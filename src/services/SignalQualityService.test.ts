import { describe, it, expect } from 'vitest';
import { buildCompositeDecision, evaluateSignalQuality } from './SignalQualityService';

describe('SignalQualityService', () => {
  it('LOW volatility, no stress, no execution penalty', () => {
    const res = evaluateSignalQuality({
      baseQualityScore: 80,
      volatilityRegime: 'LOW'
    });
    expect(res.finalQualityScore).toBe(83);
    expect(res.regimeAdjustment).toBe(3);
    expect(res.stressAdjustment).toBe(0);
    expect(res.executionAdjustment).toBe(0);
  });

  it('HIGH volatility + executionPenaltyFactor 0.5 + stress enabled', () => {
    const res = evaluateSignalQuality({
      baseQualityScore: 80,
      volatilityRegime: 'HIGH',
      executionPenaltyFactor: 0.5,
      stressScenarioEnabled: true
    });
    expect(res.regimeAdjustment).toBe(-5);
    expect(res.executionAdjustment).toBe(-5);
    expect(res.stressAdjustment).toBe(-3);
    expect(res.finalQualityScore).toBe(67);
  });

  it('Z-score bonus', () => {
    const res = evaluateSignalQuality({
      baseQualityScore: 70,
      zScoreAbs: 2.5
    });
    expect(res.zScoreAdjustment).toBe(2);
    expect(res.finalQualityScore).toBe(72);
  });

  it('Clamp behavior', () => {
    const resHigh = evaluateSignalQuality({
      baseQualityScore: 99,
      zScoreAbs: 3.5,
      volatilityRegime: 'LOW'
    });
    expect(resHigh.finalQualityScore).toBe(100);

    const resLow = evaluateSignalQuality({
      baseQualityScore: 2,
      volatilityRegime: 'HIGH',
      stressScenarioEnabled: true
    });
    expect(resLow.finalQualityScore).toBe(0);
  });

  it('buildCompositeDecision creates a regime-aware execution recommendation', () => {
    const decision = buildCompositeDecision({
      baseQualityScore: 80,
      regime: 'MOMENTUM_TREND',
      hurstExponent: 0.62,
      toxicityScore: 25,
      estimatedSlippage: 0.25,
      microstructureRisk: 0.2,
      tailRiskPenalty: 0.1,
      cvarUsed: -0.02,
      realizedVolatilityUsed: 0.15,
      signalStrength: 0.82,
      sizingConfidenceOverride: 0.8,
      crowdingRisk: 'LOW',
      concentrationRisk: 'LOW',
      executionRisk: 'LOW',
      regimeConflict: false,
      stressScenarioEnabled: false,
      executionPenaltyFactor: 1
    });

    expect(decision.compositeScore).toBeGreaterThan(0);
    expect(decision.recommendedExecutionStyle).toBeDefined();
    expect(decision.regimePolicy).toBeDefined();
    expect(decision.sizingConfidence).toBeGreaterThan(0);
    expect(decision.executionConfidence).toBeGreaterThan(0);
  });
});
