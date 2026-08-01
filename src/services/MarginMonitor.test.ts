import { describe, expect, it } from 'vitest';
import { marginMonitor } from './MarginMonitor';
import { SignalDirection } from '../types';

describe('MarginMonitor', () => {
    const positions = [
        { ticket: 1, asset: 'BTCUSD', direction: 'LONG', size: 1.2, pnl: -120, entryPrice: 50000 },
        { ticket: 2, asset: 'ETHUSD', direction: 'SHORT', size: 2.0, pnl: -40, entryPrice: 3000 },
        { ticket: 3, asset: 'BTCUSD', direction: 'SHORT', size: 0.8, pnl: 20, entryPrice: 50500 },
    ];

    it('returns LIQUIDATION_IMMINENT below 150% margin', async () => {
        const alert = await marginMonitor.checkMarginLevels(
            { equity: 1000, margin: 800 },
            { positions, signal: { direction: SignalDirection.LONG } as any }
        );

        expect(alert).not.toBeNull();
        expect(alert?.level).toBe('LIQUIDATION_IMMINENT');
        expect(alert?.suggestedReductions.length).toBeGreaterThan(0);
    });

    it('returns CRITICAL below 300% margin', async () => {
        const alert = await marginMonitor.checkMarginLevels(
            { equity: 1000, margin: 400 },
            { positions, signal: { direction: SignalDirection.SHORT } as any }
        );

        expect(alert).not.toBeNull();
        expect(alert?.level).toBe('CRITICAL');
        expect(alert?.requiredAction).toBe('REDUCE_EXPOSURE');
    });

    it('returns WARNING below 500% margin', async () => {
        const alert = await marginMonitor.checkMarginLevels(
            { equity: 1000, margin: 250 },
            { positions, signal: { direction: SignalDirection.LONG } as any }
        );

        expect(alert).not.toBeNull();
        expect(alert?.level).toBe('WARNING');
    });

    it('returns null when margin level is healthy', async () => {
        const alert = await marginMonitor.checkMarginLevels(
            { equity: 1000, margin: 120 },
            { positions }
        );

        expect(alert).toBeNull();
    });
});
