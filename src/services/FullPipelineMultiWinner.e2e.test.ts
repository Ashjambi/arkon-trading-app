import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateSignal } from './tradingAlgo';
import { AppConfig } from '../types';
import { strategyRiskBudgetService } from './StrategyRiskBudgetService';
import { portfolioVolatilityTargetService } from './PortfolioVolatilityTargetService';
import { portfolioDrawdownFloorService } from './PortfolioDrawdownFloorService';
import { tailRiskModeService } from './TailRiskModeService';
import { executionStyleService } from './ExecutionStyleService';
import { smartOrderRouterService } from './SmartOrderRouterService';


import { strategyRiskBudgetAllocatorService } from './StrategyRiskBudgetAllocatorService';





import { strategyArbitrationService } from './StrategyArbitrationService';
import { ExecutionOrchestrator } from './ExecutionOrchestrator';
import { riskLimitsService } from './RiskLimitsService';
import { preTradeRiskGuard } from './PreTradeRiskGuard';
import { tradingControlService } from './TradingControlService';
import { executionDecisionTraceService } from './ExecutionDecisionTraceService';
import { coordinationTraceService } from './CoordinationTraceService';
import * as webhookService from './webhookService';

vi.mock('./webhookService', () => ({
    sendToWebhook: vi.fn(),
    checkBridgeStatus: vi.fn()
}));

vi.mock('./RiskLimitsService', () => ({
    riskLimitsService: {
        getSnapshot: vi.fn(),
        registerExecutedOrder: vi.fn()
    }
}));

vi.mock('./PreTradeRiskGuard', () => ({
    preTradeRiskGuard: {
        evaluate: vi.fn()
    }
}));

vi.mock('./TradingControlService', () => ({
    tradingControlService: {
        evaluateControlState: vi.fn(),
        getSnapshot: vi.fn(),
        recordExecutionSkip: vi.fn(),
        recordExecutionDelay: vi.fn(),
        recordNormalExecution: vi.fn(),
        recordDegradedData: vi.fn()
    }
}));

vi.mock('./strategies/StrategyRegistry', () => ({
    getStrategyInstance: vi.fn((type) => {
        return {
            validate: vi.fn().mockReturnValue({ passed: true, score: 95, reason: '' }),
            execute: vi.fn().mockReturnValue({
                id: `mock-${type}`,
                asset: 'BTC-PERP',
                direction: 'LONG',
                strategy: type,
                qualityScore: 95,
                reasoning: 'Mocked E2E Signal',
                entry: 50000,
                stopLoss: 49000,
                takeProfit: 52000,
                tp1: 51000,
                tp2: 52000,
                strength: 'STRONG',
                timestamp: Date.now(),
                metadata: {},
                recommendedSize: 1.0,
                details: {}
            })
        };
    })
}));

vi.mock('./StrategyOrchestrator', () => ({
    StrategyOrchestrator: class {
        getOptimalStrategies() {
            return [
                { strat: 'BTC_TREND', reason: 'Mock Trend' },
                { strat: 'BTC_MEAN_REV', reason: 'Mock Mean Rev' }
            ];
        }
    }
}));

describe('FullPipelineMultiWinnerE2E', () => {
    let orchestrator: ExecutionOrchestrator;
    let addLogMock: any;
    let config: AppConfig;

    beforeEach(() => {
        vi.clearAllMocks();
        
        addLogMock = vi.fn();
        config = {
            maxTradesPerWave: 2,
            fixedLotSizeBTC: 1.0,
            webhookUrl: 'mock',
            webhookSecret: 'mock',
            maxAllocationPerTradePercent: 5,
            hunterMode: false,
            minSignalScore: 70,
            orderFlowConfig: { enabled: false },
            portfolioRiskMode: 'MODERATE'
        } as any;
        
        orchestrator = new ExecutionOrchestrator(config, true, addLogMock);
        strategyRiskBudgetService.resetBudgets();
        portfolioVolatilityTargetService.reset();
        portfolioDrawdownFloorService.reset();
        tailRiskModeService.reset();
        strategyRiskBudgetAllocatorService.reset();
        
        // Default mocks
        vi.mocked(tradingControlService.evaluateControlState).mockReturnValue('NORMAL');
        vi.mocked(tradingControlService.getSnapshot).mockReturnValue({ lastBlockReason: null } as any);
        
        vi.mocked(preTradeRiskGuard.evaluate).mockReturnValue({ allowed: true, decisionCode: 'PASS', reason: undefined });
        
        vi.mocked(webhookService.sendToWebhook).mockResolvedValue({ success: true, message: 'OK' });
        
        vi.mocked(riskLimitsService.getSnapshot).mockReturnValue({
            global: { maxDailyLoss: 1000 }, currentDailyPnL: 0,
            assets: {
                'BTC-PERP': { openPositions: 0, currentExposure: 0 }
            }
        } as any);
    });

    it('Scenario: Full Pipeline with two winners from two strategies on BTC-PERP', async () => {
        // 1. Configure Arbitration to allow multiple winners
        strategyArbitrationService.config.maxSameDirectionSignalsPerAsset = 2;

        // 2. Prepare inputs for generateSignal
        const summary = { instrument_name: 'BTC-PERP', last: 50000, funding_8h: 0 } as any;
        const candles15M = {
            status: 'ok',
            close: Array(50).fill(50000),
            high: Array(50).fill(50100),
            low: Array(50).fill(49900),
            open: Array(50).fill(50000),
            volume: Array(50).fill(10)
        } as any;
        
        // 3. Call generateSignal (simulating tradingAlgo run)
        const { signals, analysis, signal } = generateSignal(
            'BTC-PERP',
            summary,
            [summary],
            null,
            candles15M,
            candles15M, // daily
            null, // orderbook
            5,
            100,
            config,
            []
        );
        
        // Assert generateSignal output
        expect(signals.length).toBe(2);
        expect(signals[0].id).toBe('mock-BTC_TREND');
        expect(signals[1].id).toBe('mock-BTC_MEAN_REV');
        expect(signal).toBeDefined();
        expect(analysis).toBeDefined();

        // 4. Verify coordination traces
        const coordSnapshot = coordinationTraceService.getLatestSnapshot();
        expect(coordSnapshot).toBeDefined();
        expect(coordSnapshot?.inputSignals.length).toBe(2);
        expect(coordSnapshot?.finalSignals.length).toBe(2);

        // 5. Call ExecutionOrchestrator.executePlan (simulating App-level handoff)
        const success = await orchestrator.executePlan(signals as any, analysis as any, 'ENTRY');
        expect(success).toBe(true);

        // 6. Verify Execution Output
        expect(webhookService.sendToWebhook).toHaveBeenCalledTimes(2);
        
        const call1Arg = vi.mocked(webhookService.sendToWebhook).mock.calls[0][0];
        const call2Arg = vi.mocked(webhookService.sendToWebhook).mock.calls[1][0];
        
        expect(call1Arg.id).toBe('mock-BTC_TREND');
        // sig1 score was reduced to 75 by global penalty, sig2 score remained 85. Total = 160.
        // 75 / 160 = 0.46875
        expect(call1Arg.recommendedSize).toBeCloseTo(0.46875);
        expect(call2Arg.id).toBe('mock-BTC_MEAN_REV');
        // 85 / 160 = 0.53125
        expect(call2Arg.recommendedSize).toBeCloseTo(0.53125);

        // 7. Verify Execution Trace Service (for the last processed signal)
        const execSnapshot = executionDecisionTraceService.getLatestSnapshot();
        expect(execSnapshot).toBeDefined();
        expect(execSnapshot?.signal?.id).toBe('mock-BTC_MEAN_REV');
        expect(execSnapshot?.coordinationUsed).toBe(false);
        expect(execSnapshot?.executionDecision?.dispatched).toBe(true);
        expect(execSnapshot?.executionDecision?.blockedStage).toBeUndefined();
    });

    it('Scenario: Global compliance rejection clears signals array', () => {
        // Prepare inputs for generateSignal
        const summary = { instrument_name: 'BTC-PERP', last: 50000, funding_8h: 0 } as any;
        const candles15M = {
            status: 'ok',
            close: Array(50).fill(50000),
            high: Array(50).fill(50100),
            low: Array(50).fill(49900),
            open: Array(50).fill(50000),
            volume: Array(50).fill(10)
        } as any;
        
        const strictConfig: AppConfig = {
            ...config,
            minSignalScore: 80 // score penalized from 95 to 85 passes local, but then global penalty drops 85 to 75, which fails here
        };
        
        // Call generateSignal
        const { signals, signal } = generateSignal(
            'BTC-PERP',
            summary,
            [summary],
            null,
            candles15M,
            candles15M, // daily
            null, // orderbook
            5,
            100,
            strictConfig,
            []
        );
        
        // Both single signal and array of signals must be falsy/empty
        expect(signal).toBeNull();
        expect(signals.length).toBe(0);
    });

    it('Scenario: Signal Quality Enrichment layer applies adjustments to final signal', async () => {
        // Setup a scenario with specific volatility regime and Z-score
        const summary = { instrument_name: 'BTC-PERP', last: 50000, funding_8h: 0 } as any;
        // Make the price close sequence highly volatile or such that vwapZScore triggers
        const closePrices = Array(50).fill(50000);
        closePrices[48] = 52000;
        closePrices[49] = 55000;
        const candles15M = {
            status: 'ok',
            close: closePrices,
            high: closePrices,
            low: closePrices,
            open: closePrices,
            volume: Array(50).fill(10)
        } as any;

        const { signals } = generateSignal(
            'BTC-PERP',
            summary,
            [summary],
            null,
            candles15M,
            candles15M,
            null,
            5,
            100,
            { ...config, minSignalScore: 10 } as any, // low threshold to ensure signals pass
            []
        );

        expect(signals.length).toBeGreaterThan(0);
        
        // Assert that signal quality breakdown exists and was applied
        const firstSignal = signals[0];
        expect(firstSignal.metadata).toBeDefined();
        expect(firstSignal.metadata.signalQualityBreakdown).toBeDefined();
        
        const breakdown = firstSignal.metadata.signalQualityBreakdown;
        expect(typeof breakdown.baseQualityScore).toBe('number');
        expect(typeof breakdown.finalQualityScore).toBe('number');
        expect(firstSignal.qualityScore).toBe(breakdown.finalQualityScore);
        // The mock strategies return score 95. Global gates might drop it to 75. 
        // We just need to check the math of the breakdown is correct
        expect(breakdown.finalQualityScore).toBe(
            Math.max(0, Math.min(100, breakdown.baseQualityScore + breakdown.regimeAdjustment + breakdown.executionAdjustment + breakdown.stressAdjustment + breakdown.zScoreAdjustment))
        );
    });

    it('Scenario: Strategy Risk Budget partially scales execution', async () => {
        // Budget only allows 0.3 for BTC_TREND
        strategyRiskBudgetService.configureBudget('BTC_TREND', 0.3);
        
        // Prepare inputs for generateSignal
        const summary = { instrument_name: 'BTC-PERP', last: 50000, funding_8h: 0 } as any;
        const candles15M = {
            status: 'ok',
            close: Array(50).fill(50000),
            high: Array(50).fill(50100),
            low: Array(50).fill(49900),
            open: Array(50).fill(50000),
            volume: Array(50).fill(10)
        } as any;
        
        const { signals, analysis } = generateSignal(
            'BTC-PERP',
            summary,
            [summary],
            null,
            candles15M,
            candles15M,
            null,
            5,
            100,
            config,
            []
        );
        
        await orchestrator.executePlan(signals as any, analysis as any, 'ENTRY');
        
        const call1Arg = vi.mocked(webhookService.sendToWebhook).mock.calls.find(call => call[0].id === 'mock-BTC_TREND')[0];
        const call2Arg = vi.mocked(webhookService.sendToWebhook).mock.calls.find(call => call[0].id === 'mock-BTC_MEAN_REV')[0];
        
        // Original expected sizes: BTC_TREND = 0.46875, BTC_MEAN_REV = 0.53125
        // BTC_TREND is capped at 0.3
        expect(call1Arg.recommendedSize).toBeCloseTo(0.3);
        expect(call2Arg.recommendedSize).toBeCloseTo(0.53125); // unchanged
    });

    it('Scenario: Strategy Risk Budget fully blocks execution', async () => {
        // Exhaust budget for BTC_TREND
        strategyRiskBudgetService.configureBudget('BTC_TREND', 1.0);
        strategyRiskBudgetService.registerAllocation('BTC_TREND', 1.0);
        
        const summary = { instrument_name: 'BTC-PERP', last: 50000, funding_8h: 0 } as any;
        const candles15M = {
            status: 'ok',
            close: Array(50).fill(50000),
            high: Array(50).fill(50100),
            low: Array(50).fill(49900),
            open: Array(50).fill(50000),
            volume: Array(50).fill(10)
        } as any;
        
        const { signals, analysis } = generateSignal(
            'BTC-PERP',
            summary,
            [summary],
            null,
            candles15M,
            candles15M,
            null,
            5,
            100,
            config,
            []
        );
        
        vi.mocked(webhookService.sendToWebhook).mockClear();
        await orchestrator.executePlan(signals as any, analysis as any, 'ENTRY');
        
        // BTC_TREND should be skipped, so only 1 call
        expect(webhookService.sendToWebhook).toHaveBeenCalledTimes(1);
        
        const call1Arg = vi.mocked(webhookService.sendToWebhook).mock.calls[0][0];
        expect(call1Arg.id).toBe('mock-BTC_MEAN_REV');
        expect(call1Arg.recommendedSize).toBeCloseTo(0.53125);
    });

    it('Scenario: Portfolio Volatility Target scales UP but respects budget', async () => {
        // Strategy budget is 0.7 for BTC_TREND
        strategyRiskBudgetService.configureBudget('BTC_TREND', 0.7);
        
        // Volatility target is configured to scale UP by 2x
        portfolioVolatilityTargetService.configure({ targetVol: 0.10, minScale: 0.5, maxScale: 2.0 });
        portfolioVolatilityTargetService.updateVolEstimate(0.05); // scale = 2.0
        
        const summary = { instrument_name: 'BTC-PERP', last: 50000, funding_8h: 0 } as any;
        const candles15M = {
            status: 'ok',
            close: Array(50).fill(50000),
            high: Array(50).fill(50100),
            low: Array(50).fill(49900),
            open: Array(50).fill(50000),
            volume: Array(50).fill(10)
        } as any;
        
        const { signals, analysis } = generateSignal(
            'BTC-PERP',
            summary,
            [summary],
            null,
            candles15M,
            candles15M,
            null,
            5,
            100,
            config,
            []
        );
        
        await orchestrator.executePlan(signals as any, analysis as any, 'ENTRY');
        
        const call1Arg = vi.mocked(webhookService.sendToWebhook).mock.calls.find(call => call[0].id === 'mock-BTC_TREND')[0];
        const call2Arg = vi.mocked(webhookService.sendToWebhook).mock.calls.find(call => call[0].id === 'mock-BTC_MEAN_REV')[0];
        
        // Original expected sizes: BTC_TREND = 0.46875, BTC_MEAN_REV = 0.53125
        // After 2x scale:
        // BTC_TREND = 0.46875 * 2 = 0.9375 -> bounded to 0.7 (strategy budget)
        // BTC_MEAN_REV = 0.53125 * 2 = 1.0625 -> no budget configured, so 1.06 (with rounding maybe 1.06)
        
        expect(call1Arg.recommendedSize).toBeCloseTo(0.7);
        expect(call2Arg.recommendedSize).toBeCloseTo(1.06, 1);
    });

    it('Scenario: Portfolio Volatility Target scales DOWN', async () => {
        // Volatility target is configured to scale DOWN by 0.5x
        portfolioVolatilityTargetService.configure({ targetVol: 0.10, minScale: 0.5, maxScale: 2.0 });
        portfolioVolatilityTargetService.updateVolEstimate(0.20); // scale = 0.5
        
        const summary = { instrument_name: 'BTC-PERP', last: 50000, funding_8h: 0 } as any;
        const candles15M = {
            status: 'ok',
            close: Array(50).fill(50000),
            high: Array(50).fill(50100),
            low: Array(50).fill(49900),
            open: Array(50).fill(50000),
            volume: Array(50).fill(10)
        } as any;
        
        const { signals, analysis } = generateSignal(
            'BTC-PERP',
            summary,
            [summary],
            null,
            candles15M,
            candles15M,
            null,
            5,
            100,
            config,
            []
        );
        
        await orchestrator.executePlan(signals as any, analysis as any, 'ENTRY');
        
        const call1Arg = vi.mocked(webhookService.sendToWebhook).mock.calls.find(call => call[0].id === 'mock-BTC_TREND')[0];
        const call2Arg = vi.mocked(webhookService.sendToWebhook).mock.calls.find(call => call[0].id === 'mock-BTC_MEAN_REV')[0];
        
        // Original expected sizes: BTC_TREND = 0.46875, BTC_MEAN_REV = 0.53125
        // After 0.5x scale:
        // BTC_TREND = 0.46875 * 0.5 = 0.234375 -> rounded down to 0.23
        // BTC_MEAN_REV = 0.53125 * 0.5 = 0.265625 -> rounded down to 0.27
        
        expect(call1Arg.recommendedSize).toBeCloseTo(0.23, 1);
        expect(call2Arg.recommendedSize).toBeCloseTo(0.27, 1);
    });

    it('Scenario: Reset restores baseline behavior', async () => {
        portfolioVolatilityTargetService.configure({ targetVol: 0.10, minScale: 0.5, maxScale: 2.0 });
        portfolioVolatilityTargetService.updateVolEstimate(0.20); // scale = 0.5
        portfolioVolatilityTargetService.reset(); // Should revert to 1.0
        
        const summary = { instrument_name: 'BTC-PERP', last: 50000, funding_8h: 0 } as any;
        const candles15M = {
            status: 'ok',
            close: Array(50).fill(50000),
            high: Array(50).fill(50100),
            low: Array(50).fill(49900),
            open: Array(50).fill(50000),
            volume: Array(50).fill(10)
        } as any;
        
        const { signals, analysis } = generateSignal(
            'BTC-PERP',
            summary,
            [summary],
            null,
            candles15M,
            candles15M,
            null,
            5,
            100,
            config,
            []
        );
        
        await orchestrator.executePlan(signals as any, analysis as any, 'ENTRY');
        
        const call1Arg = vi.mocked(webhookService.sendToWebhook).mock.calls.find(call => call[0].id === 'mock-BTC_TREND')[0];
        
        // Original expected size: 0.46875
        expect(call1Arg.recommendedSize).toBeCloseTo(0.46875);
    });

    it('Scenario: Portfolio Drawdown soft limit scales down sizes', async () => {
        portfolioDrawdownFloorService.configure({
            maxDrawdownLimit: 0.20,
            softDrawdownLimit: 0.10,
            floorLevel: 0.85,
            hardStopEnabled: true
        });
        portfolioDrawdownFloorService.updateEquity(10000);
        portfolioDrawdownFloorService.updateEquity(8800); // 12% drop -> SOFT_DRAWDOWN, scale = 1 - 0.12/0.2 = 0.4
        
        const summary = { instrument_name: 'BTC-PERP', last: 50000, funding_8h: 0 } as any;
        const candles15M = {
            status: 'ok',
            close: Array(50).fill(50000),
            high: Array(50).fill(50100),
            low: Array(50).fill(49900),
            open: Array(50).fill(50000),
            volume: Array(50).fill(10)
        } as any;
        
        const { signals, analysis } = generateSignal(
            'BTC-PERP',
            summary,
            [summary],
            null,
            candles15M,
            candles15M,
            null,
            5,
            100,
            config,
            []
        );
        
        await orchestrator.executePlan(signals as any, analysis as any, 'ENTRY');
        
        const call1Arg = vi.mocked(webhookService.sendToWebhook).mock.calls.find(call => call[0].id === 'mock-BTC_TREND')[0];
        const call2Arg = vi.mocked(webhookService.sendToWebhook).mock.calls.find(call => call[0].id === 'mock-BTC_MEAN_REV')[0];
        
        // Original expected sizes: BTC_TREND = 0.46875, BTC_MEAN_REV = 0.53125
        // After 0.4x scale:
        // BTC_TREND = 0.46875 * 0.4 = 0.1875 -> ~0.19
        // BTC_MEAN_REV = 0.53125 * 0.4 = 0.2125 -> ~0.21
        
        expect(call1Arg.recommendedSize).toBeCloseTo(0.19, 1);
        expect(call2Arg.recommendedSize).toBeCloseTo(0.21, 1);
    });

    it('Scenario: Portfolio Drawdown hard limit blocks execution', async () => {
        portfolioDrawdownFloorService.configure({
            maxDrawdownLimit: 0.20,
            softDrawdownLimit: 0.10,
            floorLevel: 0.85,
            hardStopEnabled: true
        });
        portfolioDrawdownFloorService.updateEquity(10000);
        portfolioDrawdownFloorService.updateEquity(7000); // 30% drop -> HARD_DRAWDOWN, scale = 0.0
        
        const summary = { instrument_name: 'BTC-PERP', last: 50000, funding_8h: 0 } as any;
        const candles15M = {
            status: 'ok',
            close: Array(50).fill(50000),
            high: Array(50).fill(50100),
            low: Array(50).fill(49900),
            open: Array(50).fill(50000),
            volume: Array(50).fill(10)
        } as any;
        
        const { signals, analysis } = generateSignal(
            'BTC-PERP',
            summary,
            [summary],
            null,
            candles15M,
            candles15M,
            null,
            5,
            100,
            config,
            []
        );
        
        const anySuccess = await orchestrator.executePlan(signals as any, analysis as any, 'ENTRY');
        expect(anySuccess).toBe(false);
        expect(vi.mocked(webhookService.sendToWebhook)).not.toHaveBeenCalled();
    });

    it('Scenario: Tail Risk Mode scales down sizes', async () => {
        tailRiskModeService.configure({
            enabled: true,
            tailScale: 0.2,
            autoTriggerFromDrawdown: false,
            autoTriggerFromVolSpike: false
        });
        // Manually trigger it
        tailRiskModeService['mode'] = 'TAIL_RISK';
        
        const summary = { instrument_name: 'BTC-PERP', last: 50000, funding_8h: 0 } as any;
        const candles15M = {
            status: 'ok',
            close: Array(50).fill(50000),
            high: Array(50).fill(50100),
            low: Array(50).fill(49900),
            open: Array(50).fill(50000),
            volume: Array(50).fill(10)
        } as any;
        
        const { signals, analysis } = generateSignal(
            'BTC-PERP',
            summary,
            [summary],
            null,
            candles15M,
            candles15M,
            null,
            5,
            100,
            config,
            []
        );
        
        await orchestrator.executePlan(signals as any, analysis as any, 'ENTRY');
        
        const call1Arg = vi.mocked(webhookService.sendToWebhook).mock.calls.find(call => call[0].id === 'mock-BTC_TREND')[0];
        const call2Arg = vi.mocked(webhookService.sendToWebhook).mock.calls.find(call => call[0].id === 'mock-BTC_MEAN_REV')[0];
        
        // Original expected sizes: BTC_TREND = 0.46875, BTC_MEAN_REV = 0.53125
        // After 0.2x scale:
        // BTC_TREND = 0.46875 * 0.2 = 0.09375 -> ~0.09
        // BTC_MEAN_REV = 0.53125 * 0.2 = 0.10625 -> ~0.11
        
        expect(call1Arg.recommendedSize).toBeCloseTo(0.09, 1);
        expect(call2Arg.recommendedSize).toBeCloseTo(0.11, 1);
    });

    it('Scenario: Tail Risk Mode blocks unallowed strategies', async () => {
        tailRiskModeService.configure({
            enabled: true,
            tailScale: 0.2,
            allowedStrategies: ['BTC_TREND'], // BTC_MEAN_REV will be blocked
            autoTriggerFromDrawdown: false,
            autoTriggerFromVolSpike: false
        });
        tailRiskModeService['mode'] = 'TAIL_RISK';
        
        const summary = { instrument_name: 'BTC-PERP', last: 50000, funding_8h: 0 } as any;
        const candles15M = {
            status: 'ok',
            close: Array(50).fill(50000),
            high: Array(50).fill(50100),
            low: Array(50).fill(49900),
            open: Array(50).fill(50000),
            volume: Array(50).fill(10)
        } as any;
        
        const { signals, analysis } = generateSignal(
            'BTC-PERP',
            summary,
            [summary],
            null,
            candles15M,
            candles15M,
            null,
            5,
            100,
            config,
            []
        );
        
        await orchestrator.executePlan(signals as any, analysis as any, 'ENTRY');
        
        const call1Arg = vi.mocked(webhookService.sendToWebhook).mock.calls.find(call => call[0].id === 'mock-BTC_TREND')[0];
        const call2Arg = vi.mocked(webhookService.sendToWebhook).mock.calls.find(call => call[0].id === 'mock-BTC_MEAN_REV');
        
        expect(call1Arg.recommendedSize).toBeCloseTo(0.09, 1);
        expect(call2Arg).toBeUndefined(); // It was blocked
    });

    it('Scenario: StrategyRiskBudgetAllocatorService redistributes budget', async () => {
        strategyRiskBudgetService.resetBudgets();
        
        strategyRiskBudgetAllocatorService.configure({
            totalRiskBudget: 1.0,
            minStrategyBudget: 0.2,
            maxStrategyBudget: 0.8
        });
        
        strategyRiskBudgetAllocatorService.updatePerformanceSnapshots([
            { strategy: 'BTC_TREND', rollingReturn: 0.20 },
            { strategy: 'BTC_MEAN_REV', rollingReturn: 0.00 }
        ]);
        
        strategyRiskBudgetAllocatorService.computeAndApplyBudgets();
        
        const summary = { instrument_name: 'BTC-PERP', last: 50000, funding_8h: 0 } as any;
        const candles15M = {
            status: 'ok',
            close: Array(50).fill(50000),
            high: Array(50).fill(50100),
            low: Array(50).fill(49900),
            open: Array(50).fill(50000),
            volume: Array(50).fill(10)
        } as any;
        
        const { signals, analysis } = generateSignal(
            'BTC-PERP',
            summary,
            [summary],
            null,
            candles15M,
            candles15M,
            null,
            5,
            100,
            config,
            []
        );
        
        await orchestrator.executePlan(signals as any, analysis as any, 'ENTRY');
        
        const call1Arg = vi.mocked(webhookService.sendToWebhook).mock.calls.find(call => call[0].id === 'mock-BTC_TREND')[0];
        const call2Arg = vi.mocked(webhookService.sendToWebhook).mock.calls.find(call => call[0].id === 'mock-BTC_MEAN_REV')[0];
        
        // BTC_TREND normally ~0.46. Its budget is 0.8, so it's fully allowed
        expect(call1Arg.recommendedSize).toBeCloseTo(0.46875, 2);
        
        // BTC_MEAN_REV normally ~0.53. Its budget is clamped to ~0.2, so it's restricted
        expect(call2Arg.recommendedSize).toBeLessThan(0.3);
    });

    it('Scenario: ExecutionStyleService assigns AGGRESSIVE style for strong signals in low vol', async () => {
        tailRiskModeService.reset();
        // reset SOR if available
        const summary = { instrument_name: 'BTC-PERP', last: 50000, funding_8h: 0 } as any;
        // Low vol -> volume=1, small high/low diff
        const candles15M = {
            status: 'ok',
            close: Array(50).fill(50000),
            high: Array(50).fill(50010),
            low: Array(50).fill(49990),
            open: Array(50).fill(50000),
            volume: Array(50).fill(1)
        } as any;
        
        const { signals, analysis } = generateSignal(
            'BTC-PERP',
            summary,
            [summary],
            null,
            candles15M,
            candles15M,
            null,
            5,
            100,
            config,
            []
        );
        
        // Ensure analysis thinks it's LOW_VOLATILITY or HIGH...
        // Actually generateSignal might return UNKNOWN. We will manually set analysis.regime if needed.
        if (analysis) {
             analysis.regime = 'LOW_VOLATILITY';
             analysis.qualityScore = 85;
        }
        
        await orchestrator.executePlan(signals as any, analysis as any, 'ENTRY');
        
        const call1Arg = vi.mocked(webhookService.sendToWebhook).mock.calls.find(call => call[0].id === 'mock-BTC_TREND')[0];
        
         { console.log('CALLS:', vi.mocked(webhookService.sendToWebhook).mock.calls.map(c => c[0].id)); }
expect((call1Arg as any).executionStyle).toBe('AGGRESSIVE');
    });

    it('Scenario: ExecutionStyleService assigns PASSIVE style in TAIL_RISK mode', async () => {
        tailRiskModeService.configure({ enabled: true, tailScale: 0.5, autoTriggerFromDrawdown: false, autoTriggerFromVolSpike: false });
        tailRiskModeService['mode'] = 'TAIL_RISK';
        
        const summary = { instrument_name: 'BTC-PERP', last: 50000, funding_8h: 0 } as any;
        const candles15M = {
            status: 'ok',
            close: Array(50).fill(50000),
            high: Array(50).fill(50100),
            low: Array(50).fill(49900),
            open: Array(50).fill(50000),
            volume: Array(50).fill(10)
        } as any;
        
        const { signals, analysis } = generateSignal(
            'BTC-PERP',
            summary,
            [summary],
            null,
            candles15M,
            candles15M,
            null,
            5,
            100,
            config,
            []
        );
        
        if (analysis) {
             analysis.qualityScore = 95;
             analysis.regime = 'LOW_VOLATILITY';
        }
        
        await orchestrator.executePlan(signals as any, analysis as any, 'ENTRY');
        
        const call1Arg = vi.mocked(webhookService.sendToWebhook).mock.calls.find(call => call[0].id === 'mock-BTC_TREND')[0];
        
        expect((call1Arg as any).executionStyle).toBe('PASSIVE');
    });

    it('Scenario: SmartOrderRouterService assigns PRIMARY route for BTC in low vol (HIGH liquidity, AGGRESSIVE)', async () => {
        tailRiskModeService.reset();
        const summary = { instrument_name: 'BTC-PERP', last: 50000, funding_8h: 0 } as any;
        const candles15M = {
            status: 'ok',
            close: Array(50).fill(50000),
            high: Array(50).fill(50010),
            low: Array(50).fill(49990),
            open: Array(50).fill(50000),
            volume: Array(50).fill(1)
        } as any;
        
        const { signals, analysis } = generateSignal('BTC-PERP', summary, [summary], null, candles15M, candles15M, null, 5, 100, config, []);
        
        if (analysis) {
             analysis.regime = 'LOW_VOLATILITY';
             analysis.qualityScore = 95; // Strong signal -> AGGRESSIVE
        }
        
        await orchestrator.executePlan(signals as any, analysis as any, 'ENTRY');
        
        const call1Arg = vi.mocked(webhookService.sendToWebhook).mock.calls.find(call => call[0].id === 'mock-BTC_TREND')[0];
        
        // BTC is heuristically high liquidity. Strong signal -> AGGRESSIVE -> PRIMARY
        expect((call1Arg as any).executionStyle).toBe('AGGRESSIVE');
        expect((call1Arg as any).routeHint).toBe('PRIMARY');
    });

    it('Scenario: SmartOrderRouterService assigns SECONDARY route for ALT in low vol (MEDIUM liquidity, AGGRESSIVE)', async () => {
        tailRiskModeService.reset();
        const summary = { instrument_name: 'ALT-PERP', last: 50000, funding_8h: 0 } as any;
        const candles15M = {
            status: 'ok',
            close: Array(50).fill(50000),
            high: Array(50).fill(50010),
            low: Array(50).fill(49990),
            open: Array(50).fill(50000),
            volume: Array(50).fill(1)
        } as any;
        
        const { signals, analysis } = generateSignal('ALT-PERP', summary, [summary], null, candles15M, candles15M, null, 5, 100, config, []);
        
        if (analysis) {
             analysis.regime = 'LOW_VOLATILITY';
             analysis.qualityScore = 95; // Strong signal -> AGGRESSIVE
             if (signals) { signals.forEach(s => s.asset = 'ALT-PERP'); } // Force ALT-PERP
        }
        
        await orchestrator.executePlan(signals as any, analysis as any, 'ENTRY');
        
        const call1Arg = vi.mocked(webhookService.sendToWebhook).mock.calls.find(call => call[0].id === 'mock-BTC_TREND')[0];
        
        expect((call1Arg as any).executionStyle).toBe('AGGRESSIVE');
        expect((call1Arg as any).routeHint).toBe('SECONDARY');
    });

    it('Scenario: ExecutionAnalyticsService attaches analytics to trace', async () => {
        tailRiskModeService.reset();
        const summary = { instrument_name: 'BTC-PERP', last: 50000, funding_8h: 0 } as any;
        const candles15M = {
            status: 'ok',
            close: Array(50).fill(50000),
            high: Array(50).fill(50010),
            low: Array(50).fill(49990),
            open: Array(50).fill(50000),
            volume: Array(50).fill(1)
        } as any;
        
        const { signals, analysis } = generateSignal('BTC-PERP', summary, [summary], null, candles15M, candles15M, null, 5, 100, config, []);
        
        await orchestrator.executePlan(signals as any, analysis as any, 'ENTRY');
        
        const call1Arg = vi.mocked(webhookService.sendToWebhook).mock.calls.find(call => call[0].id === 'mock-BTC_TREND')[0];
        
        expect((call1Arg as any).executionAnalytics).toBeDefined();
        expect((call1Arg as any).executionAnalytics.fillRatio).toBeGreaterThan(0);
        expect((call1Arg as any).executionAnalytics.slippage).toBeDefined();
    });

    it('Scenario: ChildOrderSchedulerService attaches childOrders to trace', async () => {
        tailRiskModeService.reset();
        const summary = { instrument_name: 'BTC-PERP', last: 50000, funding_8h: 0 } as any;
        const candles15M = {
            status: 'ok',
            close: Array(50).fill(50000),
            high: Array(50).fill(50010),
            low: Array(50).fill(49990),
            open: Array(50).fill(50000),
            volume: Array(50).fill(1)
        } as any;
        
        const { signals, analysis } = generateSignal('BTC-PERP', summary, [summary], null, candles15M, candles15M, null, 5, 100, config, []);
        
        await orchestrator.executePlan(signals as any, analysis as any, 'ENTRY');
        
        const call1Arg = vi.mocked(webhookService.sendToWebhook).mock.calls.find(call => call[0].id === 'mock-BTC_TREND')[0];
        
        expect((call1Arg as any).childOrder).toBeDefined();
        expect(typeof (call1Arg as any).childOrder === 'object').toBe(true);
        expect((call1Arg as any).childOrder.sliceIndex).toBeGreaterThanOrEqual(0);
        expect((call1Arg as any).childOrders[0].sliceIndex).toBe(0);
        expect((call1Arg as any).childOrders[0].totalSlices).toBe((call1Arg as any).childOrders.length);
    });

    it('Scenario: ExecutionTcaAggregatorService attaches parentTcaSummary to trace', async () => {
        tailRiskModeService.reset();
        const summary = { instrument_name: 'BTC-PERP', last: 50000, funding_8h: 0 } as any;
        const candles15M = {
            status: 'ok',
            close: Array(50).fill(50000),
            high: Array(50).fill(50010),
            low: Array(50).fill(49990),
            open: Array(50).fill(50000),
            volume: Array(50).fill(1)
        } as any;
        
        const { signals, analysis } = generateSignal('BTC-PERP', summary, [summary], null, candles15M, candles15M, null, 5, 100, config, []);
        
        await orchestrator.executePlan(signals as any, analysis as any, 'ENTRY');
        
        const trace = executionDecisionTraceService.getLatestSnapshot();
        expect(trace?.executionDecision).toBeDefined();
        
        const parentTcaSummary = (trace?.executionDecision as any).parentTcaSummary;
        expect(parentTcaSummary).toBeDefined();
        expect(parentTcaSummary.totalRequestedSize).toBeGreaterThan(0);
        expect(parentTcaSummary.totalExecutedSize).toBe(parentTcaSummary.totalRequestedSize);
        expect(parentTcaSummary.parentFillRatio).toBe(1);
        expect(parentTcaSummary.childCount).toBeGreaterThan(0);
        
        const childDispatches = (trace?.executionDecision as any).childDispatches;
        expect(parentTcaSummary.childCount).toBe(childDispatches.length);
        
        let sumChildSize = 0;
        for (const child of childDispatches) {
             sumChildSize += child.childSize;
        }
        
        expect(parentTcaSummary.totalRequestedSize).toBeCloseTo(sumChildSize);
    });

    it('Scenario: ExecutionQualityMonitorService attaches alerts to trace', async () => {
        tailRiskModeService.reset();
        const summary = { instrument_name: 'BTC-PERP', last: 50000, funding_8h: 0 } as any;
        const candles15M = {
            status: 'ok',
            close: Array(50).fill(50000),
            high: Array(50).fill(50010),
            low: Array(50).fill(49990),
            open: Array(50).fill(50000),
            volume: Array(50).fill(1)
        } as any;
        
        const { signals, analysis } = generateSignal('BTC-PERP', summary, [summary], null, candles15M, candles15M, null, 5, 100, config, []);
        
        await orchestrator.executePlan(signals as any, analysis as any, 'ENTRY');
        
        const trace = executionDecisionTraceService.getLatestSnapshot();
        expect(trace?.executionDecision).toBeDefined();
        
        const status = (trace?.executionDecision as any).executionQualityStatus;
        expect(status).toBeDefined();
        expect(['ok', 'warning', 'critical']).toContain(status);
        
        const alerts = (trace?.executionDecision as any).executionQualityAlerts;
        expect(alerts).toBeDefined();
        expect(Array.isArray(alerts)).toBe(true);
    });

    it('Scenario: PostTradeExecutionReportService attaches report to trace', async () => {
        tailRiskModeService.reset();
        const summary = { instrument_name: 'BTC-PERP', last: 50000, funding_8h: 0 } as any;
        const candles15M = {
            status: 'ok',
            close: Array(50).fill(50000),
            high: Array(50).fill(50010),
            low: Array(50).fill(49990),
            open: Array(50).fill(50000),
            volume: Array(50).fill(1)
        } as any;
        
        const { signals, analysis } = generateSignal('BTC-PERP', summary, [summary], null, candles15M, candles15M, null, 5, 100, config, []);
        
        await orchestrator.executePlan(signals as any, analysis as any, 'ENTRY');
        
        const trace = executionDecisionTraceService.getLatestSnapshot();
        expect(trace?.executionDecision).toBeDefined();
        
        const report = (trace?.executionDecision as any).postTradeExecutionReport;
        expect(report).toBeDefined();
        expect(report.reportVersion).toBe('1.0');
        expect(Array.isArray(report.children)).toBe(true);
        expect(report.children.length).toBeGreaterThan(0);
        expect(report.executionQualityStatus).toBeDefined();
    });
});



