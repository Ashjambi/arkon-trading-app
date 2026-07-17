import { describe, it, expect, beforeEach } from 'vitest';
import { stressScenarioService } from './StressScenarioService';

describe('StressScenarioService', () => {
  beforeEach(() => {
    stressScenarioService.clearScenario();
  });

  it('is disabled by default', () => {
    expect(stressScenarioService.isEnabled()).toBe(false);
    expect(stressScenarioService.shouldForceDelay()).toBe(false);
    expect(stressScenarioService.shouldForceDegradedData()).toBe(false);
    expect(stressScenarioService.getVolatilityMultiplier()).toBe(1.0);
    expect(stressScenarioService.getMaxSignalsCapOverride()).toBeNull();
    expect(stressScenarioService.applyExecutionPenalty(100)).toBe(100);
  });

  it('can set and get a scenario', () => {
    stressScenarioService.setScenario({
      enabled: true,
      name: 'Test Spike',
      volatilityMultiplier: 2.5,
      forceExecutionDelay: true,
      forceDegradedData: true,
      executionPenaltyFactor: 0.5,
      maxSignalsCapOverride: 1
    });

    expect(stressScenarioService.isEnabled()).toBe(true);
    expect(stressScenarioService.getScenario().name).toBe('Test Spike');
    expect(stressScenarioService.getVolatilityMultiplier()).toBe(2.5);
    expect(stressScenarioService.shouldForceDelay()).toBe(true);
    expect(stressScenarioService.shouldForceDegradedData()).toBe(true);
    expect(stressScenarioService.getMaxSignalsCapOverride()).toBe(1);
    expect(stressScenarioService.applyExecutionPenalty(100)).toBe(50);
  });

  it('can clear a scenario', () => {
    stressScenarioService.setScenario({ enabled: true, forceExecutionDelay: true });
    expect(stressScenarioService.isEnabled()).toBe(true);
    
    stressScenarioService.clearScenario();
    expect(stressScenarioService.isEnabled()).toBe(false);
    expect(stressScenarioService.shouldForceDelay()).toBe(false);
  });

  it('returns safe defaults if fields are missing in an enabled scenario', () => {
    stressScenarioService.setScenario({ enabled: true });
    expect(stressScenarioService.isEnabled()).toBe(true);
    expect(stressScenarioService.shouldForceDelay()).toBe(false);
    expect(stressScenarioService.shouldForceDegradedData()).toBe(false);
    expect(stressScenarioService.getVolatilityMultiplier()).toBe(1.0);
    expect(stressScenarioService.getMaxSignalsCapOverride()).toBeNull();
    expect(stressScenarioService.applyExecutionPenalty(100)).toBe(100);
  });
});
