import { describe, it, expect } from 'vitest';
import { executionAnalyticsService } from './ExecutionAnalyticsService';

describe('ExecutionAnalyticsService', () => {
    it('1) Full fill, no slippage', () => {
        const result = executionAnalyticsService.compute({
            symbol: 'BTC-PERP', strategy: 'TREND', side: 'BUY',
            requestedSize: 100, executedSize: 100,
            requestedPrice: 10, executedPrice: 10,
            timestamp: new Date().toISOString(),
            executionStyle: 'AGGRESSIVE', routeHint: 'PRIMARY'
        });
        
        expect(result.fillRatio).toBe(1.0);
        expect(result.slippage).toBe(0);
        expect(result.slippageBps).toBe(0);
        expect(result.notionalExecuted).toBe(1000);
    });

    it('2) Partial fill', () => {
        const result = executionAnalyticsService.compute({
            symbol: 'BTC-PERP', strategy: 'TREND', side: 'BUY',
            requestedSize: 100, executedSize: 60,
            timestamp: new Date().toISOString(),
            executionStyle: 'PASSIVE', routeHint: 'PRIMARY'
        });
        
        expect(result.fillRatio).toBe(0.6);
        expect(result.slippage).toBeNull();
        expect(result.slippageBps).toBeNull();
        expect(result.notionalExecuted).toBeNull();
    });

    it('3) Positive slippage (worse price for buy)', () => {
        const result = executionAnalyticsService.compute({
            symbol: 'BTC-PERP', strategy: 'TREND', side: 'BUY',
            requestedSize: 100, executedSize: 100,
            requestedPrice: 10, executedPrice: 10.05,
            timestamp: new Date().toISOString(),
            executionStyle: 'AGGRESSIVE', routeHint: 'PRIMARY'
        });
        
        expect(result.slippage).toBeCloseTo(0.05, 5);
        expect(result.slippageBps).toBeCloseTo(50, 1);
    });

    it('4) Negative slippage (better price)', () => {
        const result = executionAnalyticsService.compute({
            symbol: 'BTC-PERP', strategy: 'TREND', side: 'BUY',
            requestedSize: 100, executedSize: 100,
            requestedPrice: 10, executedPrice: 9.95,
            timestamp: new Date().toISOString(),
            executionStyle: 'AGGRESSIVE', routeHint: 'PRIMARY'
        });
        
        expect(result.slippage).toBeCloseTo(-0.05, 5);
        expect(result.slippageBps).toBeCloseTo(-50, 1);
    });

    it('5) Missing price', () => {
        const result = executionAnalyticsService.compute({
            symbol: 'BTC-PERP', strategy: 'TREND', side: 'BUY',
            requestedSize: 100, executedSize: 100,
            requestedPrice: 10, // no executedPrice
            timestamp: new Date().toISOString(),
            executionStyle: 'AGGRESSIVE', routeHint: 'PRIMARY'
        });
        
        expect(result.fillRatio).toBe(1.0);
        expect(result.slippage).toBeNull();
        expect(result.slippageBps).toBeNull();
    });
});
