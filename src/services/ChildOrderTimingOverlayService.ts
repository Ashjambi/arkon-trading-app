import { ChildOrder } from './ChildOrderSchedulerService';

export interface ChildOrderTimingPlanSummary {
    dispatchMode: 'immediate' | 'staggered';
    intervalMs: number;
    totalSlices: number;
    totalPlannedDurationMs: number;
}

export class ChildOrderTimingOverlayServiceImpl {
    private readonly defaultIntervalMs = 500; // 500ms staggered default

    applyTiming(children: ChildOrder[]): ChildOrderTimingPlanSummary {
        if (!children || children.length === 0) {
            return {
                dispatchMode: 'immediate',
                intervalMs: 0,
                totalSlices: 0,
                totalPlannedDurationMs: 0
            };
        }

        const totalSlices = children.length;

        if (totalSlices === 1) {
            children[0].dispatchMode = 'immediate';
            children[0].intervalMs = 0;
            children[0].scheduledAtOffsetMs = 0;
            children[0].timingPolicy = 'sequential_immediate';
            
            return {
                dispatchMode: 'immediate',
                intervalMs: 0,
                totalSlices: 1,
                totalPlannedDurationMs: 0
            };
        }

        // Multiple slices
        let dispatchMode: 'immediate' | 'staggered' = 'immediate';
        let timingPolicy: 'sequential_immediate' | 'fixed_interval' = 'sequential_immediate';
        let intervalMs = 0;

        // Example simple rule: PASSIVE style gets staggered
        // But for this sprint, let's say MID or PASSIVE gets fixed_interval
        const style = children[0].executionStyle;
        if (style === 'PASSIVE' || style === 'MID') {
            dispatchMode = 'staggered';
            timingPolicy = 'fixed_interval';
            intervalMs = this.defaultIntervalMs;
        }

        for (let i = 0; i < totalSlices; i++) {
            const child = children[i];
            child.dispatchMode = dispatchMode;
            child.timingPolicy = timingPolicy;
            child.intervalMs = intervalMs;
            child.scheduledAtOffsetMs = i * intervalMs;
        }

        return {
            dispatchMode,
            intervalMs,
            totalSlices,
            totalPlannedDurationMs: intervalMs * (totalSlices - 1)
        };
    }
}

export const childOrderTimingOverlayService = new ChildOrderTimingOverlayServiceImpl();
