import { describe, it, expect, beforeEach } from 'vitest';
import { preTradeRiskGuard, PreTradeRiskSnapshot } from './PreTradeRiskGuard';
import { tradingControlService } from './TradingControlService';

describe('PreTradeRiskGuard', () => {
    beforeEach(() => {
        const snap = preTradeRiskGuard.getSnapshot();
        (preTradeRiskGuard as any).snapshot = {
            ...snap,
            currentWindowCount: 0,
            windowStartTs: null,
            lastDecision: null,
            lastReason: null,
            lastCheckedAt: null,
        } as PreTradeRiskSnapshot;
        tradingControlService.reset();
        tradingControlService.setManualKillSwitch(false);
    });

    const createValidCandidate = () => ({
        symbol: 'BTC-PERPETUAL',
        side: 'LONG',
        size: 1,
        notional: 50000,
        price: 50000,
        referencePrice: 50000,
        timestamp: Date.now()
    });

    const createValidContext = () => ({
        lastMarketDataTs: Date.now()
    });

    it('1. allows normal orders', () => {
        const result = preTradeRiskGuard.evaluate(createValidCandidate(), createValidContext());
        expect(result.allowed).toBe(true);
        expect(result.decisionCode).toBe('ALLOWED');
    });

    it('2. blocks when notional exceeds limit', () => {
        const candidate = createValidCandidate();
        candidate.notional = 1000000;
        const result = preTradeRiskGuard.evaluate(candidate, createValidContext());
        expect(result.allowed).toBe(false);
        expect(result.decisionCode).toBe('BLOCKED_NOTIONAL');
    });

    it('3. blocks when size exceeds limit', () => {
        const candidate = createValidCandidate();
        candidate.size = 200; 
        const result = preTradeRiskGuard.evaluate(candidate, createValidContext());
        expect(result.allowed).toBe(false);
        expect(result.decisionCode).toBe('BLOCKED_SIZE');
    });

    it('4. blocks on price deviation', () => {
        const candidate = createValidCandidate();
        candidate.price = 60000; 
        const result = preTradeRiskGuard.evaluate(candidate, createValidContext());
        expect(result.allowed).toBe(false);
        expect(result.decisionCode).toBe('BLOCKED_PRICE_DEVIATION');
    });

    it('5. blocks on throttle', () => {
        const ctx = createValidContext();
        for (let i = 0; i < 10; i++) {
            preTradeRiskGuard.evaluate(createValidCandidate(), ctx);
        }
        const result = preTradeRiskGuard.evaluate(createValidCandidate(), ctx);
        expect(result.allowed).toBe(false);
        expect(result.decisionCode).toBe('BLOCKED_THROTTLE');
    });

    it('6. blocks on stale data', () => {
        const ctx = { lastMarketDataTs: Date.now() - 40000 };
        const result = preTradeRiskGuard.evaluate(createValidCandidate(), ctx);
        expect(result.allowed).toBe(false);
        expect(result.decisionCode).toBe('BLOCKED_STALE_DATA');
    });

    it('7. blocks on missing data ts', () => {
        const ctx = { lastMarketDataTs: null };
        const result = preTradeRiskGuard.evaluate(createValidCandidate(), ctx);
        expect(result.allowed).toBe(false);
        expect(result.decisionCode).toBe('BLOCKED_STALE_DATA');
    });

    it('8. blocks if control layer is BLOCKED', () => {
        tradingControlService.setManualKillSwitch(true);
        const result = preTradeRiskGuard.evaluate(createValidCandidate(), createValidContext());
        expect(result.allowed).toBe(false);
        expect(result.decisionCode).toBe('BLOCKED_CONTROL_LAYER');
    });
});
