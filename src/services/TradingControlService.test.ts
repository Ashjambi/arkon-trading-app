import { describe, it, expect, beforeEach, vi } from 'vitest';
import { tradingControlService, TradingControlSnapshot } from './TradingControlService';

describe('TradingControlService', () => {
    beforeEach(() => {
        tradingControlService.reset();
        tradingControlService.setManualKillSwitch(false); // Make sure it's off
    });

    it('1. should start in NORMAL mode', () => {
        const snap = tradingControlService.getSnapshot();
        expect(snap.lastMode).toBe('NORMAL');
        expect(snap.autoBlocked).toBe(false);
        expect(snap.manualKillSwitch).toBe(false);
    });

    it('2. manual kill switch forces BLOCKED mode', () => {
        tradingControlService.setManualKillSwitch(true);
        expect(tradingControlService.evaluateControlState()).toBe('BLOCKED');
        const snap = tradingControlService.getSnapshot();
        expect(snap.manualKillSwitch).toBe(true);
        expect(snap.autoBlocked).toBe(true);
        expect(snap.lastBlockReason).toContain('Kill Switch');
        
        tradingControlService.setManualKillSwitch(false);
        expect(tradingControlService.evaluateControlState()).toBe('NORMAL');
    });

    it('3. triggers auto cooldown after max skip bursts', () => {
        tradingControlService.recordExecutionSkip();
        tradingControlService.recordExecutionSkip();
        tradingControlService.recordExecutionSkip(); // 3rd skip

        const mode = tradingControlService.evaluateControlState();
        expect(mode).toBe('BLOCKED');
        
        const snap = tradingControlService.getSnapshot();
        expect(snap.cooldownActive).toBe(true);
        expect(snap.cooldownUntil).not.toBeNull();
        expect(snap.autoBlocked).toBe(true);
    });

    it('4. triggers REDUCED risk mode after max delays', () => {
        for(let i=0; i<5; i++) {
            tradingControlService.recordExecutionDelay();
        }

        const mode = tradingControlService.evaluateControlState();
        expect(mode).toBe('REDUCED');
        
        const snap = tradingControlService.getSnapshot();
        expect(snap.reducedRiskMode).toBe(true);
        expect(snap.autoBlocked).toBe(false);
    });

    it('5. auto expiry of cooldown', () => {
        vi.useFakeTimers();
        
        // Trigger cooldown
        tradingControlService.recordExecutionSkip();
        tradingControlService.recordExecutionSkip();
        tradingControlService.recordExecutionSkip();
        
        expect(tradingControlService.evaluateControlState()).toBe('BLOCKED');
        expect(tradingControlService.getSnapshot().cooldownActive).toBe(true);

        // Fast forward 5 minutes and 1 second
        vi.advanceTimersByTime(5 * 60 * 1000 + 1000);
        
        // Evaluate should clear cooldown
        expect(tradingControlService.evaluateControlState()).toBe('NORMAL');
        expect(tradingControlService.getSnapshot().cooldownActive).toBe(false);
        
        vi.useRealTimers();
    });

    it('6. snapshot immutability', () => {
        const snap1 = tradingControlService.getSnapshot();
        const snap2 = tradingControlService.getSnapshot();
        expect(snap1).not.toBe(snap2); // should be deep copy
        
        snap1.recentTriggers.degradedDataBursts = 99;
        expect(tradingControlService.getSnapshot().recentTriggers.degradedDataBursts).toBe(0);
    });
});
