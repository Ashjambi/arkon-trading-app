import { describe, it, expect } from 'vitest';
import { executionQualityMonitorService } from './ExecutionQualityMonitorService';

describe('ExecutionQualityMonitorService', () => {
    it('Scenario: No alerts gives status ok', () => {
        const trace = {
            childDispatches: [{ dispatchMode: 'immediate', timingPolicy: 'sequential_immediate' }],
            timingPlanSummary: { dispatchMode: 'immediate' },
            parentTcaSummary: {
                parentFillRatio: 1.0,
                weightedAverageSlippageBps: 5,
                worstChildSlippageBps: 5
            }
        };

        const result = executionQualityMonitorService.evaluate(trace);
        expect(result.executionQualityStatus).toBe('ok');
        expect(result.executionQualityAlerts.length).toBe(0);
    });

    it('Scenario: Low fill ratio warning', () => {
        const trace = {
            childDispatches: [{ dispatchMode: 'immediate', timingPolicy: 'sequential_immediate' }],
            timingPlanSummary: { dispatchMode: 'immediate' },
            parentTcaSummary: {
                parentFillRatio: 0.85,
                weightedAverageSlippageBps: 5,
                worstChildSlippageBps: 5
            }
        };

        const result = executionQualityMonitorService.evaluate(trace);
        expect(result.executionQualityStatus).toBe('warning');
        expect(result.executionQualityAlerts.length).toBe(1);
        expect(result.executionQualityAlerts[0].code).toBe('LOW_FILL_RATIO');
        expect(result.executionQualityAlerts[0].severity).toBe('warning');
    });

    it('Scenario: Low fill ratio critical', () => {
        const trace = {
            childDispatches: [{ dispatchMode: 'immediate', timingPolicy: 'sequential_immediate' }],
            timingPlanSummary: { dispatchMode: 'immediate' },
            parentTcaSummary: {
                parentFillRatio: 0.4,
                weightedAverageSlippageBps: 5,
                worstChildSlippageBps: 5
            }
        };

        const result = executionQualityMonitorService.evaluate(trace);
        expect(result.executionQualityStatus).toBe('critical');
        expect(result.executionQualityAlerts[0].code).toBe('LOW_FILL_RATIO');
        expect(result.executionQualityAlerts[0].severity).toBe('critical');
    });

    it('Scenario: High weighted slippage bps', () => {
        const trace = {
            childDispatches: [{ dispatchMode: 'immediate', timingPolicy: 'sequential_immediate' }],
            timingPlanSummary: { dispatchMode: 'immediate' },
            parentTcaSummary: {
                parentFillRatio: 1.0,
                weightedAverageSlippageBps: 15,
                worstChildSlippageBps: 15
            }
        };

        const result = executionQualityMonitorService.evaluate(trace);
        expect(result.executionQualityStatus).toBe('warning');
        expect(result.executionQualityAlerts[0].code).toBe('HIGH_WEIGHTED_SLIPPAGE_BPS');
    });

    it('Scenario: Worst child slippage spike', () => {
        const trace = {
            childDispatches: [{ dispatchMode: 'immediate', timingPolicy: 'sequential_immediate' }],
            timingPlanSummary: { dispatchMode: 'immediate' },
            parentTcaSummary: {
                parentFillRatio: 1.0,
                weightedAverageSlippageBps: 5,
                worstChildSlippageBps: 25
            }
        };

        const result = executionQualityMonitorService.evaluate(trace);
        expect(result.executionQualityStatus).toBe('warning');
        expect(result.executionQualityAlerts[0].code).toBe('CHILD_SLIPPAGE_SPIKE');
    });

    it('Scenario: Missing parentTcaSummary', () => {
        const trace = {
            childDispatches: [{ dispatchMode: 'immediate', timingPolicy: 'sequential_immediate' }],
            timingPlanSummary: { dispatchMode: 'immediate' }
        };

        const result = executionQualityMonitorService.evaluate(trace);
        expect(result.executionQualityStatus).toBe('warning');
        expect(result.executionQualityAlerts[0].code).toBe('MISSING_PARENT_TCA');
    });

    it('Scenario: Missing timing metadata', () => {
        const trace = {
            childDispatches: [{ dispatchMode: 'immediate' }], // missing timingPolicy
            timingPlanSummary: { dispatchMode: 'immediate' },
            parentTcaSummary: {
                parentFillRatio: 1.0,
                weightedAverageSlippageBps: 5,
                worstChildSlippageBps: 5
            }
        };

        const result = executionQualityMonitorService.evaluate(trace);
        expect(result.executionQualityStatus).toBe('warning');
        expect(result.executionQualityAlerts[0].code).toBe('TIMING_METADATA_INCOMPLETE');
    });

    it('Scenario: Mixed alerts resolves to critical', () => {
        const trace = {
            childDispatches: [{ dispatchMode: 'immediate' }], // missing timing policy -> warning
            timingPlanSummary: { dispatchMode: 'immediate' },
            parentTcaSummary: {
                parentFillRatio: 0.4, // critical
                weightedAverageSlippageBps: 15, // warning
                worstChildSlippageBps: 25 // warning
            }
        };

        const result = executionQualityMonitorService.evaluate(trace);
        expect(result.executionQualityStatus).toBe('critical');
        expect(result.executionQualityAlerts.length).toBe(4);
    });
});
