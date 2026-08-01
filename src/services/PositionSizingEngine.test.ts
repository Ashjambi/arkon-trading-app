import { describe, it, expect, vi } from 'vitest';
import { positionSizingEngine } from './PositionSizingEngine';
import { calculateRealizedVolatility } from '../quant/riskManagement';
import * as logger from '../utils/logger';

describe('PositionSizingEngine', () => {
    const baseInput = {
        asset: 'BTC-PERPETUAL',
        direction: 'LONG' as const,
        baseConfigSize: 0.1,
        hunterMode: false,
        institutionalRiskCap: 5.0
    };

    it('1. Sizing stays within [0.5, 1.5] factor under normal conditions', () => {
        const input = {
            ...baseInput,
            signalStrength: 50,
            volatilityProxy: 1.0,
            microstructureRisk: 0.5,
            regime: 'TRENDING'
        };
        const result = positionSizingEngine.calculateSize(input);
        expect(result.sizeFactor).toBe(1.0);
        expect(result.recommendedSize).toBe(0.1);
    });

    it('2. High volatility => size reduced', () => {
        const input = {
            ...baseInput,
            signalStrength: 50,
            volatilityProxy: 2.5,
            microstructureRisk: 0.5,
            regime: 'TRENDING',
            prices: [100, 98, 95, 92, 87, 80],
            realizedVolatility: 0.45 // > 0.4 triggers * 0.55
        };
        const result = positionSizingEngine.calculateSize(input);
        expect(result.sizeFactor).toBe(0.55);
        expect(result.recommendedSize).toBeCloseTo(0.055, 3);
        expect(result.clampedByVolatility).toBe(true);
    });

    it('3. High microstructureRisk => size reduced', () => {
        const input = {
            ...baseInput,
            signalStrength: 50,
            volatilityProxy: 1.0,
            microstructureRisk: 0.95, // > 0.9 triggers * 0.5
            regime: 'TRENDING'
        };
        const result = positionSizingEngine.calculateSize(input);
        expect(result.sizeFactor).toBe(0.5);
        expect(result.recommendedSize).toBe(0.05);
        expect(result.clampedByMicrostructure).toBe(true);
    });

    it('4. Strong signals with low risk => modest size increase but respect caps', () => {
        const input = {
            ...baseInput,
            signalStrength: 95, // > 0.9
            volatilityProxy: 0.8,
            microstructureRisk: 0.1, // < 0.2
            regime: 'TRENDING',
            realizedVolatility: 0.1 // < 0.2, low vol for signal increase
        };
        const result = positionSizingEngine.calculateSize(input);
        // rvInput=0.1, so step 2 (rvInput<0.08) does NOT trigger; only step 5 adds +0.2 => 1.2
        expect(result.sizeFactor).toBe(1.2);
        expect(result.recommendedSize).toBeCloseTo(0.12, 3); // 0.1 * 1.2 = 0.12
    });

    it('5. HunterMode respects lower bounds and does not exceed caps', () => {
        const input = {
            ...baseInput,
            hunterMode: true,
            signalStrength: 50,
            volatilityProxy: 2.5, // would normally drop to 0.5
            microstructureRisk: 0.95, // would normally drop to 0.5 * 0.5 = 0.25
            regime: 'CHOPPY/NOISE'
        };
        const result = positionSizingEngine.calculateSize(input);
        
        // Normally it would be heavily clamped, but hunterMode keeps it at 0.8 minimum
        expect(result.sizeFactor).toBe(0.8);
        expect(result.recommendedSize).toBe(0.08); // 0.1 * 0.8
        expect(result.clampedByVolatility).toBe(false);
        expect(result.clampedByMicrostructure).toBe(false);
    });

    it('6. Legacy behavior: disabled or unavailable falls back correctly', () => {
        // Just providing base config and relying on defaults
        const input = {
            ...baseInput,
            signalStrength: undefined,
            volatilityProxy: undefined,
            microstructureRisk: undefined,
            regime: undefined
        };
        const result = positionSizingEngine.calculateSize(input);
        expect(result.sizeFactor).toBe(1.0);
        expect(result.recommendedSize).toBe(0.1);
    });

    it('7. Institutional risk cap is respected', () => {
        const input = {
            ...baseInput,
            baseConfigSize: 6.0, // Above cap
            signalStrength: 95, 
            volatilityProxy: 0.8, 
            microstructureRisk: 0.1, 
            regime: 'TRENDING'
        };
        const result = positionSizingEngine.calculateSize(input);
        expect(result.recommendedSize).toBe(5.0); // Capped
        expect(result.clampedByRisk).toBe(true);
    });

    it('8. CVaR and realized volatility reduce size when tail risk is poor', () => {
        const input = {
            ...baseInput,
            signalStrength: 70,
            volatilityProxy: 1.0,
            microstructureRisk: 0.2,
            regime: 'TRENDING',
            prices: [100, 98, 95, 92, 87, 80],
            returns: [-0.02, -0.03, -0.03, -0.05, -0.08],
            cvar: -0.12,
            realizedVolatility: 0.4,
            cvarConfidenceLevel: 0.95
        } as any;
        const result = positionSizingEngine.calculateSize(input);
        expect(result.recommendedSize).toBeLessThan(0.1);
        expect(result.clampedByTailRisk).toBe(true);
        expect(result.cvarUsed).toBeLessThan(0);
        expect(result.realizedVolatilityUsed).toBeGreaterThan(0);
    });

    it('9. Realized volatility helper computes a positive scalar from a price series', () => {
        const rv = calculateRealizedVolatility([100, 98, 95, 92, 87, 80], 5);
        expect(rv).toBeGreaterThan(0);
    });
});
