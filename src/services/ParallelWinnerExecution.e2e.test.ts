import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ExecutionOrchestrator } from './ExecutionOrchestrator';
import { riskLimitsService } from './RiskLimitsService';
import { preTradeRiskGuard } from './PreTradeRiskGuard';
import { tradingControlService } from './TradingControlService';
import { executionDecisionTraceService } from './ExecutionDecisionTraceService';
import * as webhookService from './webhookService';
import { TradingSignal, MarketAnalysisState } from '../types';

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
        recordDegradedData: vi.fn(),
        recordNormalExecution: vi.fn()
    }
}));

describe('Parallel Winner Execution E2E', () => {
    let orchestrator: ExecutionOrchestrator;
    let addLogMock: any;
    let config: any;

    beforeEach(() => {
        vi.clearAllMocks();
        
        addLogMock = vi.fn();
        config = {
            maxTradesPerWave: 2,
            fixedLotSizeBTC: 1.0,
            webhookUrl: 'mock',
            webhookSecret: 'mock',
            maxAllocationPerTradePercent: 5
        };
        orchestrator = new ExecutionOrchestrator(config, true, addLogMock);
        
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

    const createDummySignal = (id: string, strategy: string, score: number = 90): TradingSignal => ({
        id,
        asset: 'BTC-PERP',
        direction: 'LONG',
        strategy: strategy as any,
        qualityScore: score,
        reasoning: 'Test',
        entry: 50000,
        stopLoss: 49000,
        takeProfit: 52000,
        tp1: 51000,
        tp2: 52000,
        strength: 'STRONG' as any,
        timestamp: Date.now(),
        metadata: {},
        recommendedSize: 1.0,
        details: { mtfStatus: { dailyTrend: 'UP', h4Regime: 'TREND', m15Trigger: true } } as any
    });

    const analysis: MarketAnalysisState = {
        mtfStatus: { dailyTrend: 'UP', h4Regime: 'TREND', m15Trigger: true }
    } as any;

    it('Scenario 1: Parallel winners weighted by quality score', async () => {
        const sig1 = createDummySignal('1', 'S1', 90);
        const sig2 = createDummySignal('2', 'S2', 60);
        
        const tradingAlgoOutput = {
            signals: [sig1, sig2],
            analysis,
            signal: sig1
        };

        const success = await orchestrator.executePlan(tradingAlgoOutput.signals, tradingAlgoOutput.analysis, 'ENTRY');
        expect(success).toBe(true);

        expect(webhookService.sendToWebhook).toHaveBeenCalledTimes(2);
        
        const call1Arg = vi.mocked(webhookService.sendToWebhook).mock.calls[0][0];
        const call2Arg = vi.mocked(webhookService.sendToWebhook).mock.calls[1][0];
        
        expect(call1Arg.id).toBe('1');
        expect(vi.mocked(webhookService.sendToWebhook).mock.calls[0][4]).toBeCloseTo(0.6); // 90 / 150 * 1.0
        expect(call2Arg.id).toBe('2');
        expect(vi.mocked(webhookService.sendToWebhook).mock.calls[1][4]).toBeCloseTo(0.4); // 60 / 150 * 1.0
    });

    it('Scenario 2: Parallel winners capped by config', async () => {
        vi.mocked(riskLimitsService.getSnapshot).mockReturnValue({
            global: { maxDailyLoss: 1000 }, currentDailyPnL: 0,
            assets: {
                'BTC-PERP': { openPositions: 1, currentExposure: 0 }
            }
        } as any);

        const sig1 = createDummySignal('1', 'S1');
        const sig2 = createDummySignal('2', 'S2');
        
        const tradingAlgoOutput = { signals: [sig1, sig2], analysis, signal: sig1 };

        const success = await orchestrator.executePlan(tradingAlgoOutput.signals, tradingAlgoOutput.analysis, 'ENTRY');
        expect(success).toBe(true);

        expect(webhookService.sendToWebhook).toHaveBeenCalledTimes(1);
        
        const call1Arg = vi.mocked(webhookService.sendToWebhook).mock.calls[0][0];
        expect(call1Arg.id).toBe('1');
        expect(call1Arg.recommendedSize).toBe(1.0);
    });

    it('Scenario 3: Parallel winner blocked by trading control', async () => {
        const sig1 = createDummySignal('1', 'S1');
        const sig2 = createDummySignal('2', 'S2');
        
        vi.mocked(tradingControlService.evaluateControlState)
            .mockReturnValueOnce('NORMAL')
            .mockReturnValueOnce('BLOCKED');
            
        vi.mocked(tradingControlService.getSnapshot).mockReturnValue({
            lastBlockReason: 'Simulated Manual Block'
        } as any);

        const tradingAlgoOutput = { signals: [sig1, sig2], analysis, signal: sig1 };

        executionDecisionTraceService.initTrace(sig1, true);

        const success = await orchestrator.executePlan(tradingAlgoOutput.signals, tradingAlgoOutput.analysis, 'ENTRY');
        expect(success).toBe(true);

        expect(webhookService.sendToWebhook).toHaveBeenCalledTimes(1);
        
        const trace = executionDecisionTraceService.getLatestSnapshot();
        expect(trace?.executionDecision?.blockedStage).toBe('TRADING_CONTROL');
        expect(trace?.executionDecision?.reason).toBe('Simulated Manual Block');
    });

    it('Scenario 4: Parallel winner blocked by pre-trade', async () => {
        const sig1 = createDummySignal('1', 'S1');
        const sig2 = createDummySignal('2', 'S2');
        
        vi.mocked(preTradeRiskGuard.evaluate)
            .mockReturnValueOnce({ allowed: true, decisionCode: 'PASS', reason: undefined })
            .mockReturnValueOnce({ allowed: false, decisionCode: 'FAIL', reason: 'High volatility' });

        const tradingAlgoOutput = { signals: [sig1, sig2], analysis, signal: sig1 };

        executionDecisionTraceService.initTrace(sig1, true);

        const success = await orchestrator.executePlan(tradingAlgoOutput.signals, tradingAlgoOutput.analysis, 'ENTRY');
        expect(success).toBe(true);

        expect(webhookService.sendToWebhook).toHaveBeenCalledTimes(1);
        
        const trace = executionDecisionTraceService.getLatestSnapshot();
        expect(trace?.executionDecision?.blockedStage).toBe('PRE_TRADE');
        expect(trace?.executionDecision?.reason).toBe('High volatility');
    });
});

import { stressScenarioService } from './StressScenarioService';

describe('Parallel Winner Execution - STRESS SCENARIOS', () => {
    let orchestrator: ExecutionOrchestrator;
    let config: any;

    beforeEach(() => {
        vi.clearAllMocks();
        stressScenarioService.clearScenario();
        config = {
            maxTradesPerWave: 4,
            fixedLotSizeBTC: 1.0,
            webhookUrl: 'mock',
            webhookSecret: 'mock',
            maxAllocationPerTradePercent: 5
        };
        orchestrator = new ExecutionOrchestrator(config, true, vi.fn());
        
        vi.mocked(tradingControlService.evaluateControlState).mockReturnValue('NORMAL');
        vi.mocked(preTradeRiskGuard.evaluate).mockReturnValue({ allowed: true, decisionCode: 'PASS', reason: undefined });
        vi.mocked(webhookService.sendToWebhook).mockResolvedValue({ success: true, message: 'OK' });
        vi.mocked(riskLimitsService.getSnapshot).mockReturnValue({
            global: { maxDailyLoss: 1000 }, currentDailyPnL: 0,
            assets: { 'BTC-PERP': { openPositions: 0, currentExposure: 0 } }
        } as any);
    });

    const createDummySignal = (id: string, score: number = 90): TradingSignal => ({
        id, asset: 'BTC-PERP', direction: 'LONG', strategy: 'S1' as any, qualityScore: score,
        reasoning: 'Test', entry: 50000, stopLoss: 49000, takeProfit: 52000,
        tp1: 51000, tp2: 52000, strength: 'STRONG' as any, timestamp: Date.now(),
        metadata: {}, recommendedSize: 1.0, details: { mtfStatus: { dailyTrend: 'UP', h4Regime: 'TREND', m15Trigger: true } } as any
    });

    it('Stress scenario: execution penalty applied', async () => {
        stressScenarioService.setScenario({ enabled: true, executionPenaltyFactor: 0.5 });
        const sig1 = createDummySignal('1', 90);
        const sig2 = createDummySignal('2', 60);
        
        await orchestrator.executePlan([sig1, sig2], { mtfStatus: { dailyTrend: 'UP', h4Regime: 'TREND', m15Trigger: true } } as any, 'ENTRY');
        
        expect(webhookService.sendToWebhook).toHaveBeenCalledTimes(2);
        const call1Arg = vi.mocked(webhookService.sendToWebhook).mock.calls[0][0];
        const call2Arg = vi.mocked(webhookService.sendToWebhook).mock.calls[1][0];
        
        // normally 0.6 and 0.4. with 0.5 penalty, 0.3 and 0.2
        expect(vi.mocked(webhookService.sendToWebhook).mock.calls[0][4]).toBeCloseTo(0.3);
        expect(vi.mocked(webhookService.sendToWebhook).mock.calls[1][4]).toBeCloseTo(0.2);
    });

    it('Stress scenario: maxSignalsCapOverride', async () => {
        stressScenarioService.setScenario({ enabled: true, maxSignalsCapOverride: 1 });
        const sig1 = createDummySignal('1', 90);
        const sig2 = createDummySignal('2', 60);
        
        await orchestrator.executePlan([sig1, sig2], { mtfStatus: { dailyTrend: 'UP', h4Regime: 'TREND', m15Trigger: true } } as any, 'ENTRY');
        
        expect(webhookService.sendToWebhook).toHaveBeenCalledTimes(1);
        const call1Arg = vi.mocked(webhookService.sendToWebhook).mock.calls[0][0];
        expect(call1Arg.id).toBe('1');
        expect(call1Arg.recommendedSize).toBeCloseTo(1.0); // only 1 signal gets full size
    });

    it('Stress scenario: forced degraded data', async () => {
        // Mock tradingControlService to record degraded data
        vi.mocked(tradingControlService.recordDegradedData).mockImplementation(() => {});
        
        stressScenarioService.setScenario({ enabled: true, forceDegradedData: true });
        const sig1 = createDummySignal('1', 90);
        
        await orchestrator.executePlan([sig1], { mtfStatus: { dailyTrend: 'UP', h4Regime: 'TREND', m15Trigger: true } } as any, 'ENTRY');
        
        expect(tradingControlService.recordDegradedData).toHaveBeenCalled();
    });

    it('Stress scenario: no stress enabled (verify existing behavior)', async () => {
        const sig1 = createDummySignal('1', 90);
        const sig2 = createDummySignal('2', 60);
        
        await orchestrator.executePlan([sig1, sig2], { mtfStatus: { dailyTrend: 'UP', h4Regime: 'TREND', m15Trigger: true } } as any, 'ENTRY');
        
        expect(webhookService.sendToWebhook).toHaveBeenCalledTimes(2);
        const call1Arg = vi.mocked(webhookService.sendToWebhook).mock.calls[0][0];
        const call2Arg = vi.mocked(webhookService.sendToWebhook).mock.calls[1][0];
        
        expect(vi.mocked(webhookService.sendToWebhook).mock.calls[0][4]).toBeCloseTo(0.6);
        expect(vi.mocked(webhookService.sendToWebhook).mock.calls[1][4]).toBeCloseTo(0.4);
    });
});
