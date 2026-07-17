import { describe, it, expect } from 'vitest';
import { childOrderTimingOverlayService } from './ChildOrderTimingOverlayService';
import { ChildOrder } from './ChildOrderSchedulerService';

describe('ChildOrderTimingOverlayService', () => {
    it('Scenario: Single child gets immediate mode', () => {
        const children: ChildOrder[] = [{
            symbol: 'BTC-PERP',
            strategy: 'TEST',
            side: 'BUY',
            size: 1,
            executionStyle: 'AGGRESSIVE',
            routeHint: 'PRIMARY',
            sliceIndex: 0,
            totalSlices: 1
        }];

        const summary = childOrderTimingOverlayService.applyTiming(children);

        expect(summary.dispatchMode).toBe('immediate');
        expect(summary.intervalMs).toBe(0);
        expect(summary.totalSlices).toBe(1);
        expect(summary.totalPlannedDurationMs).toBe(0);

        expect(children[0].dispatchMode).toBe('immediate');
        expect(children[0].timingPolicy).toBe('sequential_immediate');
        expect(children[0].scheduledAtOffsetMs).toBe(0);
    });

    it('Scenario: AGGRESSIVE multiple children get sequential_immediate', () => {
        const children: ChildOrder[] = [
            { symbol: 'BTC-PERP', strategy: 'TEST', side: 'BUY', size: 1, executionStyle: 'AGGRESSIVE', routeHint: 'PRIMARY', sliceIndex: 0, totalSlices: 2 },
            { symbol: 'BTC-PERP', strategy: 'TEST', side: 'BUY', size: 1, executionStyle: 'AGGRESSIVE', routeHint: 'PRIMARY', sliceIndex: 1, totalSlices: 2 }
        ];

        const summary = childOrderTimingOverlayService.applyTiming(children);

        expect(summary.dispatchMode).toBe('immediate');
        expect(summary.intervalMs).toBe(0);
        expect(summary.totalPlannedDurationMs).toBe(0);

        expect(children[0].timingPolicy).toBe('sequential_immediate');
        expect(children[1].scheduledAtOffsetMs).toBe(0);
    });

    it('Scenario: PASSIVE multiple children get fixed_interval staggered', () => {
        const children: ChildOrder[] = [
            { symbol: 'BTC-PERP', strategy: 'TEST', side: 'BUY', size: 1, executionStyle: 'PASSIVE', routeHint: 'PRIMARY', sliceIndex: 0, totalSlices: 3 },
            { symbol: 'BTC-PERP', strategy: 'TEST', side: 'BUY', size: 1, executionStyle: 'PASSIVE', routeHint: 'PRIMARY', sliceIndex: 1, totalSlices: 3 },
            { symbol: 'BTC-PERP', strategy: 'TEST', side: 'BUY', size: 1, executionStyle: 'PASSIVE', routeHint: 'PRIMARY', sliceIndex: 2, totalSlices: 3 }
        ];

        const summary = childOrderTimingOverlayService.applyTiming(children);

        expect(summary.dispatchMode).toBe('staggered');
        expect(summary.intervalMs).toBe(500);
        expect(summary.totalPlannedDurationMs).toBe(1000); // 2 intervals * 500ms

        expect(children[0].timingPolicy).toBe('fixed_interval');
        expect(children[0].scheduledAtOffsetMs).toBe(0);
        expect(children[1].scheduledAtOffsetMs).toBe(500);
        expect(children[2].scheduledAtOffsetMs).toBe(1000);
    });

    it('Scenario: Null or empty children handled safely', () => {
        const summary = childOrderTimingOverlayService.applyTiming([]);
        expect(summary.dispatchMode).toBe('immediate');
        expect(summary.totalSlices).toBe(0);
    });
});
