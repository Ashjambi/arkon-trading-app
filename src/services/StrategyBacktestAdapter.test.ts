import { describe, expect, it } from 'vitest';
import { strategyBacktestAdapter } from './StrategyBacktestAdapter';

const config: any = {
    minSignalScore: 0,
    hunterMode: false,
    riskRewardRatio: 2,
    fixedLotSizeBTC: 0.1,
    fixedLotSizeETH: 0.2,
    dvol: 50,
    hurst: 0.55,
    fisher: 1.5,
    rSquared: 0.4,
    toxicity: 0.7,
    slippage: 0.001,
    vwapZScore: 2,
    ofi: 0.2,
    volRatio: 1.5,
};

describe('StrategyBacktestAdapter', () => {
    it('runs a registered strategy through BacktestEngine', async () => {
        const data = Array.from({ length: 60 }, (_, index) => ({
            timestamp: new Date(2024, 0, index + 1).getTime(),
            open: 100 + index,
            high: 102 + index,
            low: 99 + index,
            close: 101 + index,
            volume: 1000 + index,
        }));

        const result = await strategyBacktestAdapter.runStrategyBacktest(
            'BTC_TREND',
            'BTC-PERP',
            data,
            config,
            10000,
            new Date('2024-01-01'),
            new Date('2024-03-31')
        );

        expect(result).toBeDefined();
        expect(result.initialCapital).toBe(10000);
        expect(result.endingCapital).toBeGreaterThanOrEqual(0);
        expect(Array.isArray(result.trades)).toBe(true);
    });

    it('throws for unregistered strategies', async () => {
        await expect(
            strategyBacktestAdapter.runStrategyBacktest(
                'WAIT',
                'BTC-PERP',
                [],
                config,
                10000,
                new Date('2024-01-01'),
                new Date('2024-01-31')
            )
        ).rejects.toThrow(/not registered/);
    });
});
