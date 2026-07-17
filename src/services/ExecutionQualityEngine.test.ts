import { describe, it, expect } from 'vitest';
import { executionQualityEngine } from './ExecutionQualityEngine';

describe('ExecutionQualityEngine', () => {
    const baseInput = {
        asset: 'BTC-PERPETUAL',
        direction: 'LONG' as const,
        recommendedSize: 0.1,
        hunterMode: false
    };

    it('1. normal execution when state is neutral', () => {
        const result = executionQualityEngine.evaluate(baseInput);
        expect(result.executionMode).toBe('NORMAL');
        expect(result.shouldDelay).toBe(false);
        expect(result.shouldSkip).toBe(false);
        expect(result.executionPenaltyFactor).toBe(1.0);
    });

    it('2. price_improved when microPrice is slightly favorable', () => {
        const input = {
            ...baseInput,
            microPriceDeviation: 0.0005,
            microPrice: 50000
        };
        const result = executionQualityEngine.evaluate(input);
        expect(result.executionMode).toBe('PRICE_IMPROVED');
        expect(result.referencePrice).toBe(50000);
    });

    it('3. passive mode when toxicity/depth pressure rises', () => {
        const input = {
            ...baseInput,
            toxicityMetric: 0.65,
            normalizedOfi: -0.6, // adverse for LONG
            depthPressure: -0.65 // adverse for LONG
        };
        const result = executionQualityEngine.evaluate(input);
        expect(result.executionMode).toBe('PASSIVE');
        expect(result.executionPenaltyFactor).toBe(0.8);
    });

    it('4. delayed mode under moderate hostile conditions', () => {
        const input = {
            ...baseInput,
            toxicityMetric: 0.85,
            normalizedOfi: -0.8 // strongly adverse for LONG
        };
        const result = executionQualityEngine.evaluate(input);
        expect(result.executionMode).toBe('DELAYED');
        expect(result.shouldDelay).toBe(true);
        expect(result.executionPenaltyFactor).toBe(0.5);
    });

    it('5. skip mode only under extreme hostile conditions', () => {
        const input = {
            ...baseInput,
            toxicityMetric: 0.95,
            normalizedOfi: -0.9,
            depthPressure: -0.9
        };
        const result = executionQualityEngine.evaluate(input);
        expect(result.executionMode).toBe('SKIP');
        expect(result.shouldSkip).toBe(true);
        expect(result.executionPenaltyFactor).toBe(0.0);
    });
});
