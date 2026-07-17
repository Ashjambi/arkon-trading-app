import { describe, it, expect } from 'vitest';
import { TradeBuffer } from './TradeBuffer';

describe('TradeBuffer', () => {
    it('should store and retrieve recent trades', () => {
        const buffer = new TradeBuffer();
        
        const now = Date.now();
        buffer.addTrades([
            { price: 50000, amount: 1, direction: 'buy', instrument_name: 'BTC-PERPETUAL', timestamp: now - 10000 },
            { price: 50010, amount: 2, direction: 'sell', instrument_name: 'BTC-PERPETUAL', timestamp: now - 5000 },
            { price: 50020, amount: 3, direction: 'buy', instrument_name: 'BTC-PERPETUAL', timestamp: now }
        ]);

        const recent = buffer.getRecentTrades(60000);
        expect(recent.length).toBe(3);
        expect(recent[0].price).toBe(50000);
        expect(recent[0].size).toBe(1);
        expect(recent[0].direction).toBe('buy');
    });

    it('should filter out old trades based on windowMs', () => {
        const buffer = new TradeBuffer();
        
        const now = Date.now();
        buffer.addTrades([
            { price: 50000, amount: 1, direction: 'buy', instrument_name: 'BTC-PERPETUAL', timestamp: now - 70000 },
            { price: 50010, amount: 2, direction: 'sell', instrument_name: 'BTC-PERPETUAL', timestamp: now - 5000 },
            { price: 50020, amount: 3, direction: 'buy', instrument_name: 'BTC-PERPETUAL', timestamp: now }
        ]);

        const recent = buffer.getRecentTrades(60000);
        expect(recent.length).toBe(2);
        expect(recent[0].price).toBe(50010);
    });

    it('should respect memory bounds', () => {
        const buffer = new TradeBuffer(10);
        
        const trades = [];
        for (let i = 0; i < 15; i++) {
            trades.push({ price: 50000 + i, amount: 1, direction: 'buy', instrument_name: 'BTC-PERPETUAL', timestamp: Date.now() });
        }
        
        buffer.addTrades(trades);
        const recent = buffer.getRecentTrades(60000);
        
        expect(recent.length).toBe(10);
        expect(recent[0].price).toBe(50005); // The first 5 are dropped
    });
});
