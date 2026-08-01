import { describe, it, expect, beforeEach } from 'vitest';
import { evaluateHunterModeDecision, hunterModeService } from './HunterModeService';

const baseConfig: any = {
  maxTradesPerWave: 4,
  hunterModeEnabled: true,
  hunterMinSignalScore: 88,
  hunterAllowedRegimes: ['MOMENTUM_TREND', 'HIGH_VOLATILITY'],
  hunterMaxSpreadBps: 18,
  hunterMinLiquidityScore: 60,
  hunterMaxVolatilityScore: 85,
  hunterSizeMultiplier: 1.25,
  hunterTargetMultiplier: 1.2,
  hunterAllowAddOnEntry: true,
  hunterAllowReentry: true,
  hunterMaxConcurrentHunterTrades: 2,
  hunterCooldownSeconds: 20,
  hunterMinExecutionConfidence: 0.7,
  hunterDisableDuringDrawdown: true,
  hunterDrawdownThreshold: 3,
  hunterLogDecisions: true,
};

const baseInput = {
  signal: {
    qualityScore: 95,
    direction: 'LONG',
    asset: 'BTC-PERPETUAL',
    strategy: 'BTC_TREND',
  } as any,
  marketState: {
    regime: 'MOMENTUM_TREND',
    trendDirection: 'UP',
    estimatedSlippage: 0.0009,
    volRatio: 1.8,
    toxicityScore: 0.2,
    dvol: 55,
    volatility: 800,
    price: 100000,
  } as any,
  riskState: {
    controlMode: 'NORMAL',
    riskPressureHigh: false,
    drawdownBrakeActive: false,
    emergencyProtectionActive: false,
    openPositions: 1,
  } as any,
  executionState: {
    bridgeHealthy: true,
    executionConfidence: 0.9,
  },
  accountState: {
    drawdownPercent: 1,
    activeHunterTrades: 0,
  },
  config: baseConfig,
  actionType: 'ENTRY',
};

describe('HunterModeService', () => {
  beforeEach(() => {
    hunterModeService.reset();
  });

  it('enables Hunter Mode when high conviction criteria are met', () => {
    const decision = evaluateHunterModeDecision(baseInput as any);
    expect(decision.enabled).toBe(true);
    expect(decision.score).toBeGreaterThan(70);
    expect(decision.modifiers.sizeMultiplier).toBe(1.25);
    expect(decision.modifiers.targetMultiplier).toBe(1.2);
  });

  it('rejects Hunter Mode during high drawdown', () => {
    const decision = evaluateHunterModeDecision({
      ...baseInput,
      accountState: { ...baseInput.accountState, drawdownPercent: 6 },
    } as any);

    expect(decision.enabled).toBe(false);
    expect(decision.blockers).toContain('DRAWDOWN_TOO_HIGH');
  });

  it('rejects Hunter Mode when spread is too wide', () => {
    const decision = evaluateHunterModeDecision({
      ...baseInput,
      marketState: { ...baseInput.marketState, estimatedSlippage: 0.01 },
    } as any);

    expect(decision.enabled).toBe(false);
    expect(decision.blockers).toContain('SPREAD_TOO_WIDE');
  });

  it('rejects Hunter Mode when execution confidence is low', () => {
    const decision = evaluateHunterModeDecision({
      ...baseInput,
      executionState: { ...baseInput.executionState, executionConfidence: 0.4 },
    } as any);

    expect(decision.enabled).toBe(false);
    expect(decision.blockers).toContain('LOW_EXECUTION_CONFIDENCE');
  });

  it('tracks decisions and counters correctly', () => {
    const enabledDecision = evaluateHunterModeDecision(baseInput as any);
    hunterModeService.recordDecision({
      timestampUtc: new Date().toISOString(),
      asset: 'BTC-PERPETUAL',
      strategy: 'BTC_TREND',
      actionType: 'ENTRY',
      decision: enabledDecision,
    });

    const rejectedDecision = evaluateHunterModeDecision({
      ...baseInput,
      marketState: { ...baseInput.marketState, estimatedSlippage: 0.01 },
    } as any);
    hunterModeService.recordDecision({
      timestampUtc: new Date().toISOString(),
      asset: 'BTC-PERPETUAL',
      strategy: 'BTC_TREND',
      actionType: 'ENTRY',
      decision: rejectedDecision,
    });

    hunterModeService.registerHunterTradeOpened();

    const snapshot = hunterModeService.getSnapshot();
    expect(snapshot.totalEvaluations).toBe(2);
    expect(snapshot.enabledEvaluations).toBe(1);
    expect(snapshot.rejectedEvaluations).toBe(1);
    expect(snapshot.totalHunterTrades).toBe(1);
    expect(snapshot.activeHunterTrades).toBe(1);
  });
});
