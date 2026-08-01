import { describe, expect, it } from 'vitest';
import { BacktestEngine, BacktestStrategy, OHLCV } from './BacktestEngine';

describe('BacktestEngine', () => {
    const engine = new BacktestEngine();

    const candles: OHLCV[] = [
        { timestamp: new Date('2024-01-01').getTime(), open: 100, high: 110, low: 95, close: 105, volume: 1000 },
        { timestamp: new Date('2024-01-02').getTime(), open: 105, high: 108, low: 90, close: 92, volume: 1200 },
        { timestamp: new Date('2024-01-03').getTime(), open: 92, high: 120, low: 91, close: 118, volume: 1300 },
    ];

    it('runs a backtest and returns aggregate metrics', async () => {
        const strategy: BacktestStrategy = {
            generateSignal(candle, trades, index) {
                if (index === 0) return { direction: 'LONG', size: 1, takeProfit: 110, stopLoss: 95 };
                if (index === 1) return { direction: 'SHORT', size: 1, takeProfit: 91, stopLoss: 108 };
                return null;
            },
        };

        const result = await engine.runBacktest(
            strategy,
            candles,
            1000,
            new Date('2024-01-01'),
            new Date('2024-01-31')
        );

        expect(result.trades.length).toBe(2);
        // Signals use the next candle for execution, preventing same-candle look-ahead.
        expect(result.endingCapital).toBeLessThan(1000);
        expect(result.totalReturn).toBeLessThan(0);
        expect(result.winRate).toBe(0.5);
        expect(result.maxDrawdown).toBeGreaterThanOrEqual(0);
    });

    it('simulates long trades using TP before candle close when hit', () => {
        const trade = engine.simulateTrade(
            { direction: 'LONG', size: 2, takeProfit: 110, stopLoss: 95 },
            candles[0]
        );

        expect(trade.exitPrice).toBe(110);
        expect(trade.pnl).toBe(10);
    });

    it('simulates short trades using TP before candle close when hit', () => {
        const trade = engine.simulateTrade(
            { direction: 'SHORT', size: 1, takeProfit: 91, stopLoss: 108 },
            candles[1]
        );

        expect(trade.exitPrice).toBe(91);
        expect(trade.pnl).toBe(14);
    });

    it('deducts spread, slippage, and commission from simulated PnL', () => {
        const trade = engine.simulateTrade(
            { direction: 'LONG', size: 1, takeProfit: 110 },
            candles[0],
            { spreadRate: 0.002, slippageRate: 0.001, commissionRate: 0.001 }
        );

        expect(trade.grossPnl).toBeLessThan(10);
        expect(trade.transactionCosts).toBeGreaterThan(0);
        expect(trade.pnl).toBeLessThan(trade.grossPnl!);
    });

    it('calculates zero sharpe for insufficient trade count', () => {
        expect(engine.calculateSharpeRatio([])).toBe(0);
        expect(engine.calculateSharpeRatio([
            {
                entryTime: 1,
                exitTime: 1,
                direction: 'LONG',
                entryPrice: 100,
                exitPrice: 101,
                size: 1,
                pnl: 1,
                returnPct: 0.01,
            },
        ])).toBe(0);
    });

    it('calculates finite profit factor when losses exist', () => {
        const profitFactor = engine.calculateProfitFactor([
            {
                entryTime: 1,
                exitTime: 1,
                direction: 'LONG',
                entryPrice: 100,
                exitPrice: 110,
                size: 1,
                pnl: 10,
                returnPct: 0.1,
            },
            {
                entryTime: 2,
                exitTime: 2,
                direction: 'LONG',
                entryPrice: 100,
                exitPrice: 95,
                size: 1,
                pnl: -5,
                returnPct: -0.05,
            },
        ]);

        expect(profitFactor).toBe(2);
    });
});
