export interface OHLCV {
    timestamp: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
}

export interface BacktestSignal {
    direction: 'LONG' | 'SHORT';
    size?: number;
    stopLoss?: number;
    takeProfit?: number;
    confidence?: number;
}

export interface BacktestTrade {
    entryTime: number;
    exitTime: number;
    direction: 'LONG' | 'SHORT';
    entryPrice: number;
    exitPrice: number;
    size: number;
    pnl: number;
    returnPct: number;
    stopLoss?: number;
    takeProfit?: number;
    grossPnl?: number;
    transactionCosts?: number;
}

export interface BacktestExecutionConfig {
    /** One-way spread expressed as a fraction (0.0001 = 1 bp). */
    spreadRate?: number;
    /** One-way adverse fill adjustment expressed as a fraction. */
    slippageRate?: number;
    /** Commission charged on both entry and exit notional. */
    commissionRate?: number;
    /** Rejects a simulated fill when requested size exceeds this share of candle volume. */
    maxParticipationRate?: number;
}

export interface BacktestResult {
    totalReturn: number;
    maxDrawdown: number;
    sharpeRatio: number;
    winRate: number;
    profitFactor: number;
    trades: BacktestTrade[];
    equityCurve: number[];
    initialCapital: number;
    endingCapital: number;
}

export interface BacktestStrategy {
    generateSignal(candle: OHLCV, trades: BacktestTrade[], index: number, data: OHLCV[]): BacktestSignal | null;
}

export class BacktestEngine {
    public async runBacktest(
        strategy: BacktestStrategy,
        data: OHLCV[],
        initialCapital: number,
        startDate: Date,
        endDate: Date,
        execution: BacktestExecutionConfig = {}
    ): Promise<BacktestResult> {
        const filtered = data.filter((candle) => {
            const ts = Number(candle.timestamp);
            return ts >= startDate.getTime() && ts <= endDate.getTime();
        });

        const trades: BacktestTrade[] = [];
        const equityCurve: number[] = [initialCapital];
        let equity = initialCapital;
        let maxDrawdown = 0;
        let peakEquity = initialCapital;

        // A signal is created from a completed candle and filled no earlier than the next candle.
        // This avoids using the same candle's high/low as both decision data and execution data.
        for (let index = 0; index < filtered.length - 1; index++) {
            const candle = filtered[index];
            const signal = strategy.generateSignal(candle, trades, index, filtered);

            if (!signal) continue;

            if (!this.canFill(signal, filtered[index + 1], execution)) continue;
            const trade = this.simulateTrade(signal, filtered[index + 1], execution);
            trades.push(trade);
            equity += trade.pnl;
            equityCurve.push(equity);

            if (equity > peakEquity) peakEquity = equity;
            const drawdown = peakEquity > 0 ? (peakEquity - equity) / peakEquity : 0;
            if (drawdown > maxDrawdown) maxDrawdown = drawdown;
        }

        return {
            totalReturn: initialCapital > 0 ? (equity - initialCapital) / initialCapital : 0,
            maxDrawdown,
            sharpeRatio: this.calculateSharpeRatio(trades),
            winRate: this.calculateWinRate(trades),
            profitFactor: this.calculateProfitFactor(trades),
            trades,
            equityCurve,
            initialCapital,
            endingCapital: equity,
        };
    }

    public simulateTrade(signal: BacktestSignal, candle: OHLCV, execution: BacktestExecutionConfig = {}): BacktestTrade {
        const rawEntryPrice = Number(candle.open);
        const size = Math.max(0.000001, Number(signal.size ?? 1));
        const halfSpread = Math.max(0, Number(execution.spreadRate ?? 0)) / 2;
        const slippage = Math.max(0, Number(execution.slippageRate ?? 0));
        const entryPrice = signal.direction === 'LONG'
            ? rawEntryPrice * (1 + halfSpread + slippage)
            : rawEntryPrice * (1 - halfSpread - slippage);

        let exitPrice = entryPrice;
        if (signal.direction === 'LONG') {
            if (typeof signal.takeProfit === 'number' && candle.high >= signal.takeProfit) {
                exitPrice = signal.takeProfit;
            } else if (typeof signal.stopLoss === 'number' && candle.low <= signal.stopLoss) {
                exitPrice = signal.stopLoss;
            } else {
                exitPrice = candle.close;
            }
        } else {
            if (typeof signal.takeProfit === 'number' && candle.low <= signal.takeProfit) {
                exitPrice = signal.takeProfit;
            } else if (typeof signal.stopLoss === 'number' && candle.high >= signal.stopLoss) {
                exitPrice = signal.stopLoss;
            } else {
                exitPrice = candle.close;
            }
        }

        const adverseExitPrice = signal.direction === 'LONG'
            ? exitPrice * (1 - halfSpread - slippage)
            : exitPrice * (1 + halfSpread + slippage);
        const grossPnl = signal.direction === 'LONG'
            ? (adverseExitPrice - entryPrice) * size
            : (entryPrice - adverseExitPrice) * size;
        const commissionRate = Math.max(0, Number(execution.commissionRate ?? 0));
        const transactionCosts = (entryPrice + adverseExitPrice) * size * commissionRate;
        const rawPnl = grossPnl - transactionCosts;
        const returnPct = entryPrice !== 0
            ? (signal.direction === 'LONG'
                ? (adverseExitPrice - entryPrice) / entryPrice
                : (entryPrice - adverseExitPrice) / entryPrice)
            : 0;

        return {
            entryTime: candle.timestamp,
            exitTime: candle.timestamp,
            direction: signal.direction,
            entryPrice,
            exitPrice: adverseExitPrice,
            size,
            pnl: Number(rawPnl.toFixed(6)),
            returnPct,
            stopLoss: signal.stopLoss,
            takeProfit: signal.takeProfit,
            grossPnl: Number(grossPnl.toFixed(6)),
            transactionCosts: Number(transactionCosts.toFixed(6)),
        };
    }

    private canFill(signal: BacktestSignal, candle: OHLCV, execution: BacktestExecutionConfig): boolean {
        const participation = Number(execution.maxParticipationRate ?? 1);
        const size = Math.max(0.000001, Number(signal.size ?? 1));
        return !Number.isFinite(participation) || participation <= 0 || Number(candle.volume) <= 0 || size <= Number(candle.volume) * participation;
    }

    public calculateSharpeRatio(trades: BacktestTrade[]): number {
        if (trades.length < 2) return 0;
        const returns = trades.map((trade) => Number(trade.returnPct || 0));
        const avg = returns.reduce((sum, value) => sum + value, 0) / returns.length;
        const variance = returns.reduce((sum, value) => sum + Math.pow(value - avg, 2), 0) / (returns.length - 1);
        const stdDev = Math.sqrt(Math.max(variance, 0));
        if (stdDev === 0) return 0;
        return Number(((avg / stdDev) * Math.sqrt(returns.length)).toFixed(6));
    }

    public calculateWinRate(trades: BacktestTrade[]): number {
        if (trades.length === 0) return 0;
        const wins = trades.filter((trade) => trade.pnl > 0).length;
        return wins / trades.length;
    }

    public calculateProfitFactor(trades: BacktestTrade[]): number {
        const grossProfit = trades.filter((trade) => trade.pnl > 0).reduce((sum, trade) => sum + trade.pnl, 0);
        const grossLoss = trades.filter((trade) => trade.pnl < 0).reduce((sum, trade) => sum + Math.abs(trade.pnl), 0);
        if (grossLoss === 0) return grossProfit > 0 ? Number.POSITIVE_INFINITY : 0;
        return Number((grossProfit / grossLoss).toFixed(6));
    }
}

export const backtestEngine = new BacktestEngine();
