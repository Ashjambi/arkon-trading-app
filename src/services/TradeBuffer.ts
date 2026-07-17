import { deribitSocket } from "./deribitSocketService";

export interface Trade {
    timestamp: number;
    price: number;
    size: number;
    direction: 'buy' | 'sell' | null;
    instrument: string;
}

export class TradeBuffer {
    private buffer: Trade[] = [];
    private maxMemoryTrades: number;

    constructor(maxMemoryTrades = 5000) {
        this.maxMemoryTrades = maxMemoryTrades;
    }

    public addTrades(trades: any[]) {
        for (const t of trades) {
            this.buffer.push({
                timestamp: t.timestamp || Date.now(),
                price: t.price,
                size: t.amount,
                direction: t.direction || null,
                instrument: t.instrument_name
            });
        }
        // Trim buffer to memory bound
        if (this.buffer.length > this.maxMemoryTrades) {
            this.buffer = this.buffer.slice(this.buffer.length - this.maxMemoryTrades);
        }
    }

    public getRecentTrades(windowMs: number = 60000): Trade[] {
        const cutoff = Date.now() - windowMs;
        // Optimization: iterate from end to find cutoff, but simple filter is fine for max 5000 trades.
        return this.buffer.filter(t => t.timestamp >= cutoff);
    }
}

export const btcTradeBuffer = new TradeBuffer();
export const ethTradeBuffer = new TradeBuffer();
