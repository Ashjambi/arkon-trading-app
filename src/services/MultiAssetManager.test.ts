import { describe, expect, it } from 'vitest';
import { MultiAssetManager } from './MultiAssetManager';

describe('MultiAssetManager', () => {
    const createManager = () => new MultiAssetManager(
        async () => ({
            BTCUSD: 50000,
            ETHUSD: 2500,
            SOLUSD: 100,
            XRPUSD: 0.5,
            GOLD: 2400,
        }),
        async () => ([
            { symbol: 'BTCUSD', valueUSD: 1000 },
            { symbol: 'ETHUSD', valueUSD: 1000 },
            { symbol: 'SOLUSD', valueUSD: 1000 },
            { symbol: 'XRPUSD', valueUSD: 1000 },
            { symbol: 'GOLD', valueUSD: 1000 },
            { symbol: 'USDT', valueUSD: 1000 },
        ]),
        { minRebalanceDiffPct: 0.001, minOrderNotionalUSD: 1 }
    );

    it('normalizes target allocation weights to 100%', () => {
        const manager = createManager();
        const weights = manager.getTargetAllocations();
        const total = Object.values(weights).reduce((sum, w) => sum + w, 0);
        expect(total).toBeCloseTo(1, 8);
    });

    it('generates BUY/SELL orders based on deviations from target weights', async () => {
        const manager = createManager();
        const orders = await manager.rebalancePortfolio();

        expect(orders.length).toBeGreaterThan(0);

        const bySymbol = new Map(orders.map((o) => [o.symbol, o]));
        expect(bySymbol.get('BTCUSD')?.action).toBe('BUY');
        expect(bySymbol.get('ETHUSD')?.action).toBe('BUY');
        expect(bySymbol.get('SOLUSD')?.action).toBe('SELL');
    });

    it('ignores tiny drifts below configured threshold', async () => {
        const manager = new MultiAssetManager(
            async () => ({ BTCUSD: 50000, ETHUSD: 2500, SOLUSD: 100, XRPUSD: 0.5, GOLD: 2400 }),
            async () => ([
                { symbol: 'BTCUSD', valueUSD: 3000 },
                { symbol: 'ETHUSD', valueUSD: 2500 },
                { symbol: 'SOLUSD', valueUSD: 1500 },
                { symbol: 'XRPUSD', valueUSD: 1000 },
                { symbol: 'GOLD', valueUSD: 1000 },
                { symbol: 'USDT', valueUSD: 1000 },
            ]),
            { minRebalanceDiffPct: 0.2, minOrderNotionalUSD: 1000 }
        );

        const orders = await manager.rebalancePortfolio();
        expect(orders.length).toBe(0);
    });

    it('throws when required price is missing', async () => {
        const manager = new MultiAssetManager(
            async () => ({ BTCUSD: 50000, ETHUSD: 2500 }),
            async () => [{ symbol: 'BTCUSD', valueUSD: 1000 }, { symbol: 'ETHUSD', valueUSD: 1000 }]
        );

        await expect(manager.rebalancePortfolio()).rejects.toThrow(/Missing or invalid price/);
    });
});
