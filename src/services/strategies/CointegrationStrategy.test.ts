import { describe, it, expect } from 'vitest';
import { CointegrationStrategy } from './CointegrationStrategy';
import { MarketAnalysisState, AppConfig, SignalDirection } from '../../types';

describe('CointegrationStrategy - S-10X Z-Score Engine', () => {
    const config = {
        minSignalScore: 80,
        hunterMode: false,
        rSquared: 0.5,
        vwapZScore: 2.0,
    } as AppConfig;

    const baseState: MarketAnalysisState = {
        asset: 'BTC-PERPETUAL',
        price: 50000,
        fisher: 0,
        vwapDeviation: 0.05,
        vwapZScore: 0,
        vwapMain: 50000,
        vwapUpper: 51000,
        vwapLower: 49000,
        volatility: 0,
        bullishSweep: false,
        bearishSweep: false,
        swingLow: 0,
        swingHigh: 0,
        rSquared: 0.8,
        dvol: 50,
        hurst: 0,
        volRatio: 1,
        yearlyHigh: 0,
        yearlyLow: 0,
        pricePositionRank: 50,
        regime: 'MEAN_REVERSION',
        qualityScore: 90,
        primaryBlocker: '',
        isCooldownActive: false,
        cooldownRemaining: 0,
        isCorrelatedBlocked: false,
        liquidityGap: 0,
        toxicityScore: 0,
        estimatedSlippage: 0,
        dataLatencyMs: 0,
        scoreBreakdown: [],
        dominantFactor: '',
        reversalProbability: 0,
        trendDirection: 'NEUTRAL',
        fundingRate: 0.001,
        openInterest: 0,
        isNewsPaused: false,
        isDailyLossPaused: false,
        allSummaries: [
            { instrument_name: 'BTC-PERPETUAL', last: 50000, funding_8h: 0.001, open_interest: 0, volume: 0 },
            { instrument_name: 'ETH-PERPETUAL', last: 3000, funding_8h: 0, open_interest: 0, volume: 0 },
        ],
        mtfStatus: {
            dailyTrend: 'NEUTRAL',
            h4Regime: '',
            m15Trigger: false,
        },
    };

    const strategy = new CointegrationStrategy();

    it('should fall back to degradedMode and pass if cointZScore inputs are missing', () => {
        // Missing cointZScore, cointRollingMean, cointRollingStd, cointStrength
        const state = { ...baseState };
        const result = strategy.validate(state, config);
        // It should pass because vwapDevAbs = 5 >= 2 (default threshold) -> +40
        // rSquared = 0.8 -> +15
        // aligned funding -> +15
        // toxicity < threshold -> +10 
        // total 80, >= 80 -> passed
        expect(result.passed).toBe(true);
        expect(result.score).toBeGreaterThanOrEqual(80);
    });

    it('should reject if cointZScore is below threshold', () => {
        const state: MarketAnalysisState = {
            ...baseState,
            cointZScore: 1.5,
            cointRollingMean: 0.1,
            cointRollingStd: 0.02,
            cointStrength: 0.8,
        };
        const result = strategy.validate(state, config);
        expect(result.passed).toBe(false);
        expect(result.reason).toContain('Z-Score magnitude');
    });

    it('should reject if cointStrength is below threshold', () => {
        const state: MarketAnalysisState = {
            ...baseState,
            cointZScore: 2.5,
            cointRollingMean: 0.1,
            cointRollingStd: 0.02,
            cointStrength: 0.4,
        };
        const result = strategy.validate(state, config);
        expect(result.passed).toBe(false);
        expect(result.reason).toContain('Cointegration strength proxy');
    });

    it('should pass if S-10X conditions are met', () => {
        const state: MarketAnalysisState = {
            ...baseState,
            cointZScore: -2.1,
            cointRollingMean: 0.1,
            cointRollingStd: 0.02,
            cointStrength: 0.7,
            cointHalfLife: 15,
        };
        const result = strategy.validate(state, config);
        expect(result.passed).toBe(true);
        expect(result.score).toBeGreaterThanOrEqual(80);
    });

    it('should remain degraded if rollingStd is missing/invalid but everything else passes', () => {
        const state: MarketAnalysisState = {
            ...baseState,
            cointZScore: 2.5,
            cointRollingMean: 0.1,
            // cointRollingStd missing -> degraded mode
            cointStrength: 0.8,
            correlationId: 'TEST-CORRELATION-ID-123',
        };
        const result = strategy.validate(state, config);
        expect(result.passed).toBe(true);
    });
});
