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

    it('7. per-asset isolation — BTC degraded data does NOT block ETH', () => {
        // Trigger 3 degraded-data bursts on BTC only
        tradingControlService.recordDegradedData('BTC');
        tradingControlService.recordDegradedData('BTC');
        tradingControlService.recordDegradedData('BTC');

        // BTC should be BLOCKED
        expect(tradingControlService.evaluateControlState('BTC')).toBe('BLOCKED');

        // ETH should remain NORMAL
        expect(tradingControlService.evaluateControlState('ETH')).toBe('NORMAL');
    });

    it('8. per-asset isolation — ETH cooldown does NOT affect BTC', () => {
        // Start cooldown on ETH only
        tradingControlService.startCooldown('ETH');

        // ETH should be BLOCKED
        expect(tradingControlService.evaluateControlState('ETH')).toBe('BLOCKED');

        // BTC should remain NORMAL
        expect(tradingControlService.evaluateControlState('BTC')).toBe('NORMAL');
    });

    it('9. per-asset isolation — independent burst counters between BTC and ETH', () => {
        // BTC gets 2 degraded data bursts
        tradingControlService.recordDegradedData('BTC');
        tradingControlService.recordDegradedData('BTC');

        // ETH gets 1 execution skip
        tradingControlService.recordExecutionSkip('ETH');

        // BTC: 2 bursts → REDUCED (BURST_THRESHOLD=3, totalBursts=2 < 3)
        expect(tradingControlService.evaluateControlState('BTC')).toBe('NORMAL');

        // ETH: 1 burst → NORMAL
        expect(tradingControlService.evaluateControlState('ETH')).toBe('NORMAL');

        // Add 1 more degraded data to BTC (3 total) → BLOCKED
        tradingControlService.recordDegradedData('BTC');
        expect(tradingControlService.evaluateControlState('BTC')).toBe('BLOCKED');

        // ETH still only has 1 execution skip → NORMAL
        expect(tradingControlService.evaluateControlState('ETH')).toBe('NORMAL');

        // Add 2 more execution skips to ETH (3 total) → BLOCKED
        tradingControlService.recordExecutionSkip('ETH');
        tradingControlService.recordExecutionSkip('ETH');
        expect(tradingControlService.evaluateControlState('ETH')).toBe('BLOCKED');

        // BTC remains BLOCKED (unchanged by ETH's state)
        expect(tradingControlService.evaluateControlState('BTC')).toBe('BLOCKED');
    });

    it('10. getSnapshot() returns per-asset state map', () => {
        tradingControlService.recordDegradedData('BTC');
        tradingControlService.recordDegradedData('ETH');

        const snap = tradingControlService.getSnapshot();
        expect(snap.assetStates).toBeDefined();
        expect(snap.assetStates!['BTC']).toBeDefined();
        expect(snap.assetStates!['ETH']).toBeDefined();
        expect(snap.assetStates!['BTC'].recentTriggers.degradedDataBursts).toBe(1);
        expect(snap.assetStates!['ETH'].recentTriggers.degradedDataBursts).toBe(1);
    });
});
