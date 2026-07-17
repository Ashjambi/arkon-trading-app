import { describe, it, expect, vi } from 'vitest';
import { ETHScalperStrategy } from './ETH_SCALPER';
import { MarketAnalysisState, AppConfig, SignalDirection } from '../../../types';
import * as logger from '../../../utils/logger';

describe('ETHScalperStrategy - S-10Y Microstructure Phase 2', () => {
    const config = {
        minSignalScore: 80,
        hunterMode: false,
    } as AppConfig;

    const baseState: MarketAnalysisState = {
        asset: 'ETH-PERPETUAL',
        price: 3000,
        fisher: -0.4, // Deep oversold, strong long score (+40)
        vwapDeviation: -0.01,
        vwapZScore: -1, // +5
        vwapMain: 3050,
        vwapUpper: 3100,
        vwapLower: 3000,
        volatility: 0.05,
        bullishSweep: true, // +30 => Total longScore > 80
        bearishSweep: false,
        swingLow: 2900,
        swingHigh: 3200,
        rSquared: 0.8,
        dvol: 80,
        hurst: 0.6,
        volRatio: 1.0,
        yearlyHigh: 4000,
        yearlyLow: 2000,
        pricePositionRank: 50,
        regime: 'MEAN_REVERSION',
        qualityScore: 0,
        primaryBlocker: '',
        isCooldownActive: false,
        cooldownRemaining: 0,
        isCorrelatedBlocked: false,
        liquidityGap: 0.0,
        toxicityScore: 0,
        estimatedSlippage: 0,
        dataLatencyMs: 0,
        scoreBreakdown: [],
        dominantFactor: '',
        reversalProbability: 0,
        trendDirection: 'NEUTRAL',
        fundingRate: 0.0001,
        openInterest: 1000000,
        isNewsPaused: false,
        isDailyLossPaused: false,
        mtfStatus: { dailyTrend: 'NEUTRAL', h4Regime: 'MEAN_REVERSION', m15Trigger: false },
        
        // S-10Y Microstructure variables
        orderBookImbalance: null, // Degraded by default
        correlationId: 'TEST-S10Y'
    };

    it('1. degradedMode: if orderBookImbalance is null, S-10Y does not veto', () => {
        const spy = vi.spyOn(logger, 'logStructured');
        const strategy = new ETHScalperStrategy();
        
        const state = { ...baseState, orderBookImbalance: null };
        const result = strategy.validate(state, config);
        
        expect(result.passed).toBe(true);
        expect(result.direction).toBe(SignalDirection.LONG);
        
        const logCalls = spy.mock.calls.filter(c => c[2] === 'scalper_microstructure_accepted');
        expect(logCalls.length).toBe(1);
        expect(logCalls[0][4].degradedMode).toBe(true);
        expect(logCalls[0][4].orderBookImbalance).toBeNull();
        expect(logCalls[0][4].passed).toBe(true);
        expect(logCalls[0][4].correlationId).toBe('TEST-S10Y');
        
        spy.mockRestore();
    });

    it('2. LONG contradiction veto: rejects LONG if OBI is strongly negative with hostile context', () => {
        const spy = vi.spyOn(logger, 'logStructured');
        const strategy = new ETHScalperStrategy();
        
        const state = { 
            ...baseState, 
            orderBookImbalance: -0.4, // Materially negative (<= -0.3)
            liquidityGap: -0.06 // Hostile liquidity (< -0.05)
        };
        const result = strategy.validate(state, config);
        
        expect(result.passed).toBe(false);
        expect(result.reason).toContain('Strong ask imbalance + confirmation (Flow/Context)');
        
        const logCalls = spy.mock.calls.filter(c => c[2] === 'scalper_microstructure_rejected');
        expect(logCalls.length).toBe(1);
        expect(logCalls[0][4].passed).toBe(false);
        expect(logCalls[0][4].degradedMode).toBe(false);
        expect(logCalls[0][4].orderBookImbalance).toBe(-0.4);
        
        spy.mockRestore();
    });

    it('3. SHORT contradiction veto: rejects SHORT if OBI is strongly positive with hostile context', () => {
        const spy = vi.spyOn(logger, 'logStructured');
        const strategy = new ETHScalperStrategy();
        
        const state = { 
            ...baseState, 
            fisher: 0.4, // Deep overbought -> SHORT
            vwapZScore: 1, // SHORT
            bullishSweep: false,
            bearishSweep: true, // SHORT score ++
            orderBookImbalance: 0.4, // Materially positive (>= 0.3)
            liquidityGap: 0.06 // Hostile liquidity (> 0.05)
        };
        const result = strategy.validate(state, config);
        
        expect(result.passed).toBe(false);
        expect(result.direction).toBe(SignalDirection.SHORT);
        expect(result.reason).toContain('Strong bid imbalance + confirmation (Flow/Context)');
        
        spy.mockRestore();
    });

    it('4. no veto when OBI exists but contradiction is weak', () => {
        const strategy = new ETHScalperStrategy();
        
        const state = { 
            ...baseState, 
            orderBookImbalance: -0.2, // Negative, but not materially negative (not <= -0.3)
            liquidityGap: -0.06 // Hostile context, but OBI isn't strong enough
        };
        const result = strategy.validate(state, config);
        
        expect(result.passed).toBe(true);
        expect(result.direction).toBe(SignalDirection.LONG);
    });

    it('5. hunterMode preservation: S-10Y must not override or break relaxed execution flow unintentionally', () => {
        const spy = vi.spyOn(logger, 'logStructured');
        const strategy = new ETHScalperStrategy();
        
        // Setup state so score is ~70. 
        // minSignalScore = 80 -> normally fails. 
        // hunterMode = true -> effective threshold = 60 -> passes.
        const state = { 
            ...baseState, 
            bullishSweep: false, // Drop score by 30
            fisher: -0.4, // 40
            vwapZScore: -1, // 5
            orderBookImbalance: null, // Degraded
        }; // Score will be 45 (base) + 40 (fisher) + 5 (vwapZScore) - wait, ETH SCALPER adds +25 base, not 45. Let's see: 
        // longScore = 5 (vwap) + 40 (oversold) + 25 (base) = 70
        // normally 70 < 80 => fails
        // hunterMode => 70 >= 60 => passes

        // First test without hunter mode
        const resultWithoutHunter = strategy.validate(state, config);
        expect(resultWithoutHunter.passed).toBe(false);

        // Now with hunter mode
        const hunterConfig = { ...config, hunterMode: true };
        const resultWithHunter = strategy.validate(state, hunterConfig);
        expect(resultWithHunter.passed).toBe(true);
        
        const logCalls = spy.mock.calls.filter(c => c[2] === 'scalper_microstructure_accepted');
        expect(logCalls.length).toBe(1);
        expect(logCalls[0][4].hunterMode).toBe(true);
        expect(logCalls[0][4].threshold).toBe(60);
        
        spy.mockRestore();
    });

    it('6. microprice and top level imbalance act as secondary confirmation', () => {
        const strategy = new ETHScalperStrategy();
        
        // Setup state where OBI contradicts, but we don't have hostile liquidity
        // We add hostile top level and hostile microprice to trigger the veto
        const state = { 
            ...baseState, 
            orderBookImbalance: -0.4, // Materially negative (<= -0.3)
            liquidityGap: 0, // Not hostile
            topLevelImbalance: -0.3, // Hostile top level
            microPriceDeviation: -0.0002 // Hostile microprice
        };
        const result = strategy.validate(state, config);
        
        expect(result.passed).toBe(false);
        expect(result.reason).toContain('Strong ask imbalance + confirmation (Flow/Context)');
    });

    it('7. unchanged legacy behavior when new fields are null', () => {
        const strategy = new ETHScalperStrategy();
        
        // Setup state where OBI contradicts, but no other confirmations
        const state = { 
            ...baseState, 
            orderBookImbalance: -0.4, // Materially negative (<= -0.3)
            liquidityGap: 0, // Not hostile
            topLevelImbalance: null, 
            microPriceDeviation: null 
        };
        const result = strategy.validate(state, config);
        
        // Since there is no other confirmation, it should not be vetoed
        expect(result.passed).toBe(true);
        expect(result.direction).toBe(SignalDirection.LONG);
    });

    it('8. vetoes when flow is highly toxic and contradicts', () => {
        const strategy = new ETHScalperStrategy();
        
        // Hostile flow alone with context/toxicity
        const state = { 
            ...baseState, 
            orderBookImbalance: -0.1, // Not hostile book
            tradeFlowAvailable: true,
            normalizedOfi: -0.3, // Hostile flow
            toxicityMetric: 0.8, // Toxic flow
            liquidityGap: 0,
            topLevelImbalance: null, 
            microPriceDeviation: null 
        };
        const result = strategy.validate(state, config);
        
        expect(result.passed).toBe(false);
        expect(result.reason).toContain('Strong ask flow + toxic/context');
    });

    it('9. preserves degraded mode when flow features are missing', () => {
        const strategy = new ETHScalperStrategy();
        
        // Hostile book, but no secondary confirmations and no flow
        const state = { 
            ...baseState, 
            orderBookImbalance: -0.4,
            tradeFlowAvailable: false,
            normalizedOfi: null,
            toxicityMetric: null,
            liquidityGap: 0,
            topLevelImbalance: null, 
            microPriceDeviation: null 
        };
        const result = strategy.validate(state, config);
        
        expect(result.passed).toBe(true);
        expect(result.direction).toBe(SignalDirection.LONG);
    });
});
