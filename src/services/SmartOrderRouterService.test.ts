import { describe, it, expect } from 'vitest';
import { smartOrderRouterService } from './SmartOrderRouterService';

describe('SmartOrderRouterService', () => {
    it('1) High liquidity + aggressive -> PRIMARY', () => {
        expect(smartOrderRouterService.decideRoute({
            symbol: 'BTC-PERP', instrumentType: 'CRYPTO', notional: 1000,
            executionStyle: 'AGGRESSIVE', liquidityTier: 'HIGH'
        })).toBe('PRIMARY');
    });

    it('2) Medium liquidity + aggressive -> SECONDARY', () => {
        expect(smartOrderRouterService.decideRoute({
            symbol: 'ALT-PERP', instrumentType: 'CRYPTO', notional: 1000,
            executionStyle: 'AGGRESSIVE', liquidityTier: 'MEDIUM'
        })).toBe('SECONDARY');
    });

    it('3) High liquidity + passive -> PRIMARY', () => {
        expect(smartOrderRouterService.decideRoute({
            symbol: 'BTC-PERP', instrumentType: 'CRYPTO', notional: 1000,
            executionStyle: 'PASSIVE', liquidityTier: 'HIGH'
        })).toBe('PRIMARY');
    });

    it('4) MID style + low liquidity -> SECONDARY', () => {
        expect(smartOrderRouterService.decideRoute({
            symbol: 'ALT-PERP', instrumentType: 'CRYPTO', notional: 1000,
            executionStyle: 'MID', liquidityTier: 'LOW'
        })).toBe('SECONDARY');
    });

    it('5) DARK rule', () => {
        expect(smartOrderRouterService.decideRoute({
            symbol: 'AAPL', instrumentType: 'EQUITY', notional: 150000,
            executionStyle: 'PASSIVE', liquidityTier: 'HIGH'
        })).toBe('DARK');
    });
});
