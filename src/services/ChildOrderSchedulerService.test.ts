import { describe, it, expect } from 'vitest';
import { childOrderSchedulerService } from './ChildOrderSchedulerService';

describe('ChildOrderSchedulerService', () => {
    it('1) Small order unsliced', () => {
        const parent = {
            symbol: 'BTC-PERP', strategy: 'TREND', side: 'BUY' as const,
            totalSize: 0.8,
            executionStyle: 'PASSIVE' as const, routeHint: 'PRIMARY' as const
        };
        const slices = childOrderSchedulerService.schedule(parent);
        
        expect(slices.length).toBe(1);
        expect(slices[0].size).toBe(0.8);
        expect(slices[0].totalSlices).toBe(1);
        expect(slices[0].sliceIndex).toBe(0);
    });

    it('2) Aggressive large order', () => {
        const parent = {
            symbol: 'BTC-PERP', strategy: 'TREND', side: 'BUY' as const,
            totalSize: 10,
            executionStyle: 'AGGRESSIVE' as const, routeHint: 'PRIMARY' as const
        };
        const slices = childOrderSchedulerService.schedule(parent);
        
        // ceil(10 / 2.0) = 5, max = 3 -> 3 slices
        expect(slices.length).toBe(3);
        const sum = slices.reduce((acc, s) => acc + s.size, 0);
        expect(sum).toBeCloseTo(10, 3);
        // Base size = floor(10/3 * 1000)/1000 = 3.333
        expect(slices[0].size).toBe(3.333);
        expect(slices[1].size).toBe(3.333);
        expect(slices[2].size).toBeCloseTo(10 - 6.666, 3); // 3.334
    });

    it('3) Passive large order', () => {
        const parent = {
            symbol: 'BTC-PERP', strategy: 'TREND', side: 'BUY' as const,
            totalSize: 10,
            executionStyle: 'PASSIVE' as const, routeHint: 'PRIMARY' as const
        };
        const slices = childOrderSchedulerService.schedule(parent);
        
        // ceil(10 / 1.0) = 10, max = 10 -> 10 slices
        expect(slices.length).toBe(10);
        const sum = slices.reduce((acc, s) => acc + s.size, 0);
        expect(sum).toBeCloseTo(10, 3);
        expect(slices[0].size).toBe(1.0);
    });

    it('4) MID style order', () => {
        const parent = {
            symbol: 'BTC-PERP', strategy: 'TREND', side: 'BUY' as const,
            totalSize: 6,
            executionStyle: 'MID' as const, routeHint: 'PRIMARY' as const
        };
        const slices = childOrderSchedulerService.schedule(parent);
        
        // ceil(6 / 1.5) = 4, max = 5 -> 4 slices
        expect(slices.length).toBe(4);
        const sum = slices.reduce((acc, s) => acc + s.size, 0);
        expect(sum).toBeCloseTo(6, 3);
        expect(slices[0].size).toBe(1.5);
    });

    it('5) Remainder handling', () => {
        const parent = {
            symbol: 'BTC-PERP', strategy: 'TREND', side: 'BUY' as const,
            totalSize: 10.3,
            executionStyle: 'AGGRESSIVE' as const, routeHint: 'PRIMARY' as const
        };
        const slices = childOrderSchedulerService.schedule(parent);
        
        // ceil(10.3 / 2.0) = 6, max = 3 -> 3 slices
        expect(slices.length).toBe(3);
        const sum = slices.reduce((acc, s) => acc + s.size, 0);
        expect(sum).toBeCloseTo(10.3, 3);
        
        // 10.3 / 3 = 3.433
        expect(slices[0].size).toBe(3.433);
        expect(slices[1].size).toBe(3.433);
        // remainder = 10.3 - 6.866 = 3.434
        expect(slices[2].size).toBe(3.434);
    });
});
