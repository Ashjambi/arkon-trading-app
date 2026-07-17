import { describe, it, expect, beforeEach } from 'vitest';
import { tailRiskModeService } from './TailRiskModeService';

describe('TailRiskModeService', () => {
  beforeEach(() => {
    tailRiskModeService.reset();
  });

  it('1) No config / disabled', () => {
    expect(tailRiskModeService.getMode()).toBe('NORMAL');
    expect(tailRiskModeService.getTailScale()).toBe(1.0);
    expect(tailRiskModeService.shouldAllowStrategy('ANY_STRAT')).toBe(true);
  });

  it('2) Manual tail mode (no whitelist)', () => {
    tailRiskModeService.configure({
      enabled: true,
      tailScale: 0.2,
      autoTriggerFromDrawdown: false,
      autoTriggerFromVolSpike: false
    });
    // Trigger via a manual vol spike to set state (or we could expose a manual setter, but let's just trigger it)
    tailRiskModeService.configure({
        enabled: true,
        tailScale: 0.2,
        autoTriggerFromDrawdown: true,
        autoTriggerDrawdownThreshold: 0.2,
        autoTriggerFromVolSpike: false
    });
    tailRiskModeService.evaluateAutoTriggers({ currentDrawdown: 0.25 });
    
    expect(tailRiskModeService.getMode()).toBe('TAIL_RISK');
    expect(tailRiskModeService.getTailScale()).toBe(0.2);
    expect(tailRiskModeService.shouldAllowStrategy('ANY_STRAT')).toBe(true);
  });

  it('3) Strategy whitelist', () => {
    tailRiskModeService.configure({
      enabled: true,
      tailScale: 0.2,
      allowedStrategies: ['DEFENSIVE_A'],
      autoTriggerFromDrawdown: true,
      autoTriggerDrawdownThreshold: 0.2,
      autoTriggerFromVolSpike: false
    });
    tailRiskModeService.evaluateAutoTriggers({ currentDrawdown: 0.25 });
    
    expect(tailRiskModeService.getMode()).toBe('TAIL_RISK');
    expect(tailRiskModeService.shouldAllowStrategy('DEFENSIVE_A')).toBe(true);
    expect(tailRiskModeService.shouldAllowStrategy('AGGRESSIVE_X')).toBe(false);
  });

  it('4) Drawdown auto-trigger', () => {
    tailRiskModeService.configure({
      enabled: true,
      tailScale: 0.1,
      autoTriggerFromDrawdown: true,
      autoTriggerDrawdownThreshold: 0.25,
      autoTriggerFromVolSpike: false
    });
    tailRiskModeService.evaluateAutoTriggers({ currentDrawdown: 0.30 });
    
    expect(tailRiskModeService.getMode()).toBe('TAIL_RISK');
    expect(tailRiskModeService.getSnapshot().lastReason).toBe('DRAWDOWN_TRIGGER');
  });

  it('5) Vol spike auto-trigger', () => {
    tailRiskModeService.configure({
      enabled: true,
      tailScale: 0.1,
      autoTriggerFromDrawdown: false,
      autoTriggerFromVolSpike: true,
      volSpikeThreshold: 2.5
    });
    tailRiskModeService.evaluateAutoTriggers({ baselineVol: 0.10, currentVolEstimate: 0.30 });
    
    expect(tailRiskModeService.getMode()).toBe('TAIL_RISK');
    expect(tailRiskModeService.getSnapshot().lastReason).toBe('VOL_SPIKE_TRIGGER');
  });
});
