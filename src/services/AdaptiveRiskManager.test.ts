import { describe, it, expect } from 'vitest';
import { adaptiveRiskManager } from './AdaptiveRiskManager';

describe('AdaptiveRiskManager', () => {
    it('caps exposure at max percentage of account', () => {
        const result = adaptiveRiskManager.calculatePositionSize(
            10000,
            95,
            0.1,
            [[1, 0.2], [0.2, 1]],
            { maxExposurePct: 0.15 }
        );

        expect(result).toBeLessThanOrEqual(1500);
        expect(result).toBeGreaterThan(0);
    });

    it('reduces exposure when volatility increases', () => {
        const lowVol = adaptiveRiskManager.calculatePositionSize(10000, 80, 0.2, [[1, 0.2], [0.2, 1]]);
        const highVol = adaptiveRiskManager.calculatePositionSize(10000, 80, 2.0, [[1, 0.2], [0.2, 1]]);

        expect(highVol).toBeLessThan(lowVol);
    });

    it('rewards diversification when correlations are lower', () => {
        const lowCorr = adaptiveRiskManager.calculatePositionSize(10000, 80, 0.3, [[1, 0.1], [0.1, 1]]);
        const highCorr = adaptiveRiskManager.calculatePositionSize(10000, 80, 0.3, [[1, 0.9], [0.9, 1]]);

        expect(lowCorr).toBeGreaterThan(highCorr);
    });

    it('computes dynamic stop loss and take profit for long', () => {
        const levels = adaptiveRiskManager.calculateDynamicStopLoss(100, 'LONG', 2, 'TRENDING');

        expect(levels.stopLoss).toBe(96);
        expect(levels.takeProfit).toBe(108);
    });

    it('computes dynamic stop loss and take profit for short', () => {
        const levels = adaptiveRiskManager.calculateDynamicStopLoss(100, 'SHORT', 2, 'RANGING');

        expect(levels.stopLoss).toBe(103);
        expect(levels.takeProfit).toBe(95);
    });
});
