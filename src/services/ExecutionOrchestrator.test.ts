import { childOrderSchedulerService } from './ChildOrderSchedulerService';
import * as webhookService from './webhookService';
import { auditTrailService } from './AuditTrailService';
import * as adaptiveRiskModule from './AdaptiveRiskManager';

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ExecutionOrchestrator } from './ExecutionOrchestrator';
import { riskLimitsService } from './RiskLimitsService';
import { preTradeRiskGuard } from './PreTradeRiskGuard';
import { strategyRiskBudgetService } from './StrategyRiskBudgetService';

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

vi.mock('./StrategyRiskBudgetService', () => ({
    strategyRiskBudgetService: {
        canAllocate: vi.fn(),
        registerAllocation: vi.fn(),
    }
}));

vi.mock('./telegramService', () => ({
    sendSignalToTelegram: vi.fn(),
    sendTradeExecutionAlertToTelegram: vi.fn()
}));

vi.mock('./webhookService', () => ({
    sendToWebhook: vi.fn(),
    checkBridgeStatus: vi.fn()
}));

vi.mock('./AuditTrailService', () => ({
    auditTrailService: {
        logDecision: vi.fn(),
        getRecent: vi.fn(),
    }
}));

vi.mock('./AdaptiveRiskManager', () => ({
    adaptiveRiskManager: {
        calculatePositionSize: vi.fn(),
        calculateDynamicStopLoss: vi.fn(),
    }
}));

describe('ExecutionOrchestrator.executePlan', () => {
    let addLogMock: any;
    let orchestrator: ExecutionOrchestrator;

    beforeEach(() => {
        addLogMock = vi.fn();
        const config: any = {
            maxTradesPerWave: 2,
            fixedLotSizeBTC: 1.0,
            webhookUrl: 'mock',
            webhookSecret: 'mock',
            maxAllocationPerTradePercent: 5
        };
        orchestrator = new ExecutionOrchestrator(config, true, addLogMock);
        
        // Mock default behaviors
        vi.mocked(preTradeRiskGuard.evaluate).mockReturnValue({ allowed: true, decisionCode: 'PASS', reason: undefined });
        vi.mocked(strategyRiskBudgetService.canAllocate).mockReturnValue({ allowed: true, approvedSize: 999 });
        
        // Use require() to mock internal webhook call within the file? No, we mocked the module
        vi.mocked(webhookService.sendToWebhook).mockResolvedValue({ success: true, message: 'OK' });
        vi.mocked(webhookService.sendToWebhook).mockClear();
        vi.mocked(auditTrailService.logDecision).mockResolvedValue(undefined as any);
        vi.mocked(auditTrailService.logDecision).mockClear();
        vi.mocked(adaptiveRiskModule.adaptiveRiskManager.calculatePositionSize).mockReturnValue(0);
        vi.mocked(adaptiveRiskModule.adaptiveRiskManager.calculateDynamicStopLoss).mockReturnValue({ stopLoss: 49000, takeProfit: 51000 });
    });

    it('should limit parallel executions based on config (available slots)', async () => {
        vi.mocked(riskLimitsService.getSnapshot).mockReturnValue({
            global: { maxDailyLoss: 1000 }, currentDailyPnL: 0, assets: {
                'BTC-PERP': { openPositions: 1, currentExposure: 0 }
            }
        } as any);
        
        const signals = [
            { asset: 'BTC-PERP', id: '1', strategy: 'S1', recommendedSize: 1.0 },
            { asset: 'BTC-PERP', id: '2', strategy: 'S2', recommendedSize: 1.0 },
            { asset: 'BTC-PERP', id: '3', strategy: 'S3', recommendedSize: 1.0 },
        ];
        
        const success = await orchestrator.executePlan(signals, { mtfStatus: { dailyTrend: 'UP', h4Regime: 'TREND', m15Trigger: true } } as any);
        expect(success).toBe(true);
        
        // Since max is 2 and open is 1, only 1 slot is available.
        // It should only execute the first signal.
        
        expect(webhookService.sendToWebhook).toHaveBeenCalledTimes(1);
    });

    it('should split lot sizes according to available slots', async () => {
        vi.mocked(riskLimitsService.getSnapshot).mockReturnValue({
            global: { maxDailyLoss: 1000 }, currentDailyPnL: 0, assets: {
                'BTC-PERP': { openPositions: 0, currentExposure: 0 }
            }
        } as any);
        
        const signals = [
            { asset: 'BTC-PERP', id: '1', strategy: 'S1', recommendedSize: 1.0, entry: 50000 },
            { asset: 'BTC-PERP', id: '2', strategy: 'S2', recommendedSize: 1.0, entry: 50000 },
        ];
        
        // max is 2, open is 0. 2 slots available.
        // It should execute 2 signals and halve their lot sizes.
        const success = await orchestrator.executePlan(signals, { mtfStatus: { dailyTrend: 'UP', h4Regime: 'TREND', m15Trigger: true } } as any);
        expect(success).toBe(true);
        
        
        expect(webhookService.sendToWebhook).toHaveBeenCalledTimes(2);
        
        // The first argument to sendToWebhook is the signal object which now should have recommendedSize = 0.5
        const firstCallArg = vi.mocked(webhookService.sendToWebhook).mock.calls[0][0];
        expect(firstCallArg.recommendedSize).toBe(0.5);
    });

    it('should cap hunter boosted size by strategy budget', async () => {
        vi.mocked(riskLimitsService.getSnapshot).mockReturnValue({
            global: { maxDailyLoss: 1000, maxOpenPositions: 10 },
            currentDailyPnL: 0,
            currentOpenPositions: 0,
            assets: {
                'BTC-PERP': { openPositions: 0, currentExposure: 0 }
            }
        } as any);

        vi.mocked(strategyRiskBudgetService.canAllocate).mockReturnValue({ allowed: true, approvedSize: 0.6 });

        const testConfig: any = {
            webhookUrl: 'http://test.com',
            webhookSecret: 'secret',
            maxAllocationPerTradePercent: 5,
            fixedLotSizeBTC: 1,
            fixedLotSizeETH: 1,
            forceClosePnL: 0.5,
            maxTradesPerWave: 5,
            hunterModeEnabled: true,
            hunterMinSignalScore: 88,
            hunterAllowedRegimes: ['MOMENTUM_TREND'],
            hunterMaxSpreadBps: 25,
            hunterMinLiquidityScore: 20,
            hunterMaxVolatilityScore: 95,
            hunterSizeMultiplier: 1.5,
            hunterTargetMultiplier: 1.2,
            hunterAllowAddOnEntry: true,
            hunterAllowReentry: true,
            hunterMaxConcurrentHunterTrades: 3,
            hunterCooldownSeconds: 10,
            hunterMinExecutionConfidence: 0.6,
            hunterDisableDuringDrawdown: false,
            hunterDrawdownThreshold: 5,
            hunterLogDecisions: false,
        };

        const localOrchestrator = new ExecutionOrchestrator(testConfig, true, addLogMock);
        await localOrchestrator.executePlan([
            {
                asset: 'BTC-PERP',
                id: 'hunter-risk-cap',
                strategy: 'S1',
                qualityScore: 99,
                direction: 'LONG',
                recommendedSize: 1,
                entry: 50000,
            }
        ] as any, {
            regime: 'MOMENTUM_TREND',
            trendDirection: 'UP',
            estimatedSlippage: 0.0005,
            volRatio: 1.8,
            toxicityScore: 0.2,
            dvol: 40,
            volatility: 500,
            price: 50000,
            qualityScore: 99,
            mtfStatus: { dailyTrend: 'UP', h4Regime: 'TREND', m15Trigger: true }
        } as any, 'ENTRY');

        const firstCall = vi.mocked(webhookService.sendToWebhook).mock.calls[0];
        expect(firstCall[4]).toBe(0.6);
    });

    it('should open circuit breaker after consecutive webhook failures and block subsequent risk-increasing orders', async () => {
        vi.useFakeTimers();
        try {
            vi.mocked(riskLimitsService.getSnapshot).mockReturnValue({
                global: { maxDailyLoss: 1000 }, currentDailyPnL: 0, assets: {
                    'BTC-PERP': { openPositions: 0, currentExposure: 0 }
                }
            } as any);

            const config: any = {
                maxTradesPerWave: 1,
                fixedLotSizeBTC: 1.0,
                fixedLotSizeETH: 1.0,
                webhookUrl: 'mock',
                webhookSecret: 'mock',
                maxAllocationPerTradePercent: 5,
                circuitBreakerFailureThreshold: 2,
                circuitBreakerRecoveryTimeoutMs: 10000,
                circuitBreakerHalfOpenMaxCalls: 1,
                executionMaxRetries: 0,
            };
            const localOrchestrator = new ExecutionOrchestrator(config, true, addLogMock);

            vi.mocked(webhookService.sendToWebhook).mockResolvedValue({ success: false, message: 'fail' } as any);

            const signal = { asset: 'BTC-PERP', id: 'cb-open', strategy: 'S1', recommendedSize: 1.0, entry: 50000 };
            const analysis = { mtfStatus: { dailyTrend: 'UP', h4Regime: 'TREND', m15Trigger: true } } as any;

            await localOrchestrator.executePlan([signal] as any, analysis, 'ENTRY');
            await localOrchestrator.executePlan([{ ...signal, id: 'cb-open-2' }] as any, analysis, 'ENTRY');

            const statusAfterFailures = localOrchestrator.getCircuitBreakerStatus('BTC-PERP');
            expect(statusAfterFailures.state).toBe('OPEN');

            await localOrchestrator.executePlan([{ ...signal, id: 'cb-open-3' }] as any, analysis, 'ENTRY');
            expect(webhookService.sendToWebhook).toHaveBeenCalledTimes(2);
        } finally {
            vi.useRealTimers();
        }
    });

    it('should move to half-open after timeout and close on successful probe', async () => {
        vi.useFakeTimers();
        try {
            vi.mocked(riskLimitsService.getSnapshot).mockReturnValue({
                global: { maxDailyLoss: 1000 }, currentDailyPnL: 0, assets: {
                    'BTC-PERP': { openPositions: 0, currentExposure: 0 }
                }
            } as any);

            const config: any = {
                maxTradesPerWave: 1,
                fixedLotSizeBTC: 1.0,
                fixedLotSizeETH: 1.0,
                webhookUrl: 'mock',
                webhookSecret: 'mock',
                maxAllocationPerTradePercent: 5,
                circuitBreakerFailureThreshold: 1,
                circuitBreakerRecoveryTimeoutMs: 1000,
                circuitBreakerHalfOpenMaxCalls: 1,
                executionMaxRetries: 0,
            };
            const localOrchestrator = new ExecutionOrchestrator(config, true, addLogMock);

            vi.mocked(webhookService.sendToWebhook)
                .mockResolvedValueOnce({ success: false, message: 'fail' } as any)
                .mockResolvedValueOnce({ success: true, message: 'ok' } as any);

            const signal = { asset: 'BTC-PERP', id: 'cb-recover', strategy: 'S1', recommendedSize: 1.0, entry: 50000 };
            const analysis = { mtfStatus: { dailyTrend: 'UP', h4Regime: 'TREND', m15Trigger: true } } as any;

            await localOrchestrator.executePlan([signal] as any, analysis, 'ENTRY');
            expect(localOrchestrator.getCircuitBreakerStatus('BTC-PERP').state).toBe('OPEN');

            vi.advanceTimersByTime(1001);

            await localOrchestrator.executePlan([{ ...signal, id: 'cb-recover-probe' }] as any, analysis, 'ENTRY');
            expect(localOrchestrator.getCircuitBreakerStatus('BTC-PERP').state).toBe('CLOSED');
            expect(webhookService.sendToWebhook).toHaveBeenCalledTimes(2);
        } finally {
            vi.useRealTimers();
        }
    });

    it('should retry with exponential backoff and eventually succeed on transient webhook failures', async () => {
        vi.useFakeTimers();
        try {
            vi.mocked(riskLimitsService.getSnapshot).mockReturnValue({
                global: { maxDailyLoss: 1000 }, currentDailyPnL: 0, assets: {
                    'BTC-PERP': { openPositions: 0, currentExposure: 0 }
                }
            } as any);

            const config: any = {
                maxTradesPerWave: 1,
                fixedLotSizeBTC: 1.0,
                fixedLotSizeETH: 1.0,
                webhookUrl: 'mock',
                webhookSecret: 'mock',
                maxAllocationPerTradePercent: 5,
                executionMaxRetries: 2,
                executionRetryBaseDelayMs: 100,
                executionRetryJitterMs: 0,
                circuitBreakerFailureThreshold: 5,
            };
            const localOrchestrator = new ExecutionOrchestrator(config, true, addLogMock);

            vi.mocked(webhookService.sendToWebhook)
                .mockResolvedValueOnce({ success: false, message: 'transient-1' } as any)
                .mockResolvedValueOnce({ success: false, message: 'transient-2' } as any)
                .mockResolvedValueOnce({ success: true, message: 'ok' } as any);

            const execPromise = localOrchestrator.executePlan([
                { asset: 'BTC-PERP', id: 'retry-success', strategy: 'S1', recommendedSize: 1.0, entry: 50000 }
            ] as any, { mtfStatus: { dailyTrend: 'UP', h4Regime: 'TREND', m15Trigger: true } } as any, 'ENTRY');

            await vi.runAllTimersAsync();
            const success = await execPromise;

            expect(success).toBe(true);
            expect(webhookService.sendToWebhook).toHaveBeenCalledTimes(3);
            expect(localOrchestrator.getCircuitBreakerStatus('BTC-PERP').state).toBe('CLOSED');
        } finally {
            vi.useRealTimers();
        }
    });

    it('should fail after max retries are exhausted', async () => {
        vi.useFakeTimers();
        try {
            vi.mocked(riskLimitsService.getSnapshot).mockReturnValue({
                global: { maxDailyLoss: 1000 }, currentDailyPnL: 0, assets: {
                    'BTC-PERP': { openPositions: 0, currentExposure: 0 }
                }
            } as any);

            const config: any = {
                maxTradesPerWave: 1,
                fixedLotSizeBTC: 1.0,
                fixedLotSizeETH: 1.0,
                webhookUrl: 'mock',
                webhookSecret: 'mock',
                maxAllocationPerTradePercent: 5,
                executionMaxRetries: 2,
                executionRetryBaseDelayMs: 100,
                executionRetryJitterMs: 0,
                circuitBreakerFailureThreshold: 10,
            };
            const localOrchestrator = new ExecutionOrchestrator(config, true, addLogMock);

            vi.mocked(webhookService.sendToWebhook).mockResolvedValue({ success: false, message: 'down' } as any);

            const execPromise = localOrchestrator.executePlan([
                { asset: 'BTC-PERP', id: 'retry-fail', strategy: 'S1', recommendedSize: 1.0, entry: 50000 }
            ] as any, { mtfStatus: { dailyTrend: 'UP', h4Regime: 'TREND', m15Trigger: true } } as any, 'ENTRY');

            await vi.runAllTimersAsync();
            const success = await execPromise;

            expect(success).toBe(false);
            expect(webhookService.sendToWebhook).toHaveBeenCalledTimes(3);
        } finally {
            vi.useRealTimers();
        }
    });

    it('should write audit log when webhook dispatch fails', async () => {
        vi.useFakeTimers();
        try {
            vi.mocked(riskLimitsService.getSnapshot).mockReturnValue({
                global: { maxDailyLoss: 1000, maxOpenPositions: 10 },
                currentDailyPnL: 0,
                currentOpenPositions: 0,
                assets: {
                    'BTC-PERP': { openPositions: 0, currentExposure: 0.2 }
                }
            } as any);

            const config: any = {
                maxTradesPerWave: 1,
                fixedLotSizeBTC: 1.0,
                fixedLotSizeETH: 1.0,
                webhookUrl: 'http://127.0.0.1:3000',
                webhookSecret: 'mock',
                maxAllocationPerTradePercent: 5,
                executionMaxRetries: 0,
                circuitBreakerFailureThreshold: 3,
            };
            const localOrchestrator = new ExecutionOrchestrator(config, true, addLogMock);

            vi.mocked(webhookService.sendToWebhook).mockResolvedValue({ success: false, message: 'down' } as any);

            const success = await localOrchestrator.executePlan([
                { asset: 'BTC-PERP', id: 'audit-fail', strategy: 'S1', direction: 'LONG', recommendedSize: 1.0, entry: 50000 }
            ] as any, { qualityScore: 90, volatility: 2, dvol: 20, mtfStatus: { dailyTrend: 'UP', h4Regime: 'TREND', m15Trigger: true } } as any, 'ENTRY');

            await vi.runAllTimersAsync();
            expect(success).toBe(false);
            expect(auditTrailService.logDecision).toHaveBeenCalled();

            const lastAuditArg = vi.mocked(auditTrailService.logDecision).mock.calls.at(-1)?.[0] as any;
            expect(lastAuditArg?.metadata?.decisionStage).toBe('WEBHOOK_DISPATCH');
            expect(lastAuditArg?.metadata?.severity).toMatch(/WARN|CRITICAL/);
        } finally {
            vi.useRealTimers();
        }
    });

    it('should write audit log for successful child dispatch', async () => {
        vi.mocked(riskLimitsService.getSnapshot).mockReturnValue({
            global: { maxDailyLoss: 1000, maxOpenPositions: 10 },
            currentDailyPnL: 0,
            currentOpenPositions: 0,
            assets: {
                'BTC-PERP': { openPositions: 0, currentExposure: 0.1 }
            }
        } as any);

        const config: any = {
            maxTradesPerWave: 1,
            fixedLotSizeBTC: 1.0,
            fixedLotSizeETH: 1.0,
            webhookUrl: 'http://127.0.0.1:3000',
            webhookSecret: 'mock',
            maxAllocationPerTradePercent: 5,
            executionMaxRetries: 0,
        };
        const localOrchestrator = new ExecutionOrchestrator(config, true, addLogMock);

        vi.mocked(webhookService.sendToWebhook).mockResolvedValue({ success: true, message: 'ok' } as any);

        const success = await localOrchestrator.executePlan([
            { asset: 'BTC-PERP', id: 'audit-success', strategy: 'S1', direction: 'LONG', recommendedSize: 1.0, entry: 50000 }
        ] as any, { qualityScore: 95, volatility: 1.8, dvol: 22, mtfStatus: { dailyTrend: 'UP', h4Regime: 'TREND', m15Trigger: true } } as any, 'ENTRY');

        expect(success).toBe(true);
        expect(auditTrailService.logDecision).toHaveBeenCalled();
        const hasSuccessAudit = vi.mocked(auditTrailService.logDecision).mock.calls.some((call) => {
            const payload: any = call[0];
            return payload?.metadata?.decisionStage === 'WEBHOOK_DISPATCH' && payload?.metadata?.severity === 'INFO';
        });
        expect(hasSuccessAudit).toBe(true);
    });

    it('should cap lot size using adaptive risk notional exposure', async () => {
        vi.mocked(riskLimitsService.getSnapshot).mockReturnValue({
            global: { maxDailyLoss: 1000, maxOpenPositions: 10 },
            currentDailyPnL: 0,
            currentOpenPositions: 0,
            assets: {
                'BTC-PERP': { openPositions: 0, currentExposure: 0 }
            }
        } as any);

        vi.mocked(adaptiveRiskModule.adaptiveRiskManager.calculatePositionSize).mockReturnValue(1000);

        const config: any = {
            maxTradesPerWave: 1,
            fixedLotSizeBTC: 1.0,
            fixedLotSizeETH: 1.0,
            webhookUrl: 'http://127.0.0.1:3000',
            webhookSecret: 'mock',
            maxAllocationPerTradePercent: 5,
            adaptiveRiskEnabled: true,
            adaptiveRiskMaxExposurePct: 0.15,
            disableInitialSL: true,
        };

        const localOrchestrator = new ExecutionOrchestrator(config, true, addLogMock);
        vi.mocked(webhookService.sendToWebhook).mockResolvedValue({ success: true, message: 'ok' } as any);

        await localOrchestrator.executePlan([
            { asset: 'BTC-PERP', id: 'adaptive-cap', strategy: 'S1', direction: 'LONG', recommendedSize: 1.0, entry: 50000 }
        ] as any, { qualityScore: 95, volatility: 1.2, dvol: 22, mtfStatus: { dailyTrend: 'UP', h4Regime: 'TREND', m15Trigger: true } } as any, 'ENTRY', { equity: 10000 });

        const firstCall = vi.mocked(webhookService.sendToWebhook).mock.calls[0];
        expect(firstCall[4]).toBeLessThanOrEqual(0.03);
        expect(firstCall[4]).toBeGreaterThan(0.01);
    });

    it('should set adaptive dynamic stop-loss and take-profit when enabled', async () => {
        vi.mocked(riskLimitsService.getSnapshot).mockReturnValue({
            global: { maxDailyLoss: 1000, maxOpenPositions: 10 },
            currentDailyPnL: 0,
            currentOpenPositions: 0,
            assets: {
                'BTC-PERP': { openPositions: 0, currentExposure: 0 }
            }
        } as any);

        vi.mocked(adaptiveRiskModule.adaptiveRiskManager.calculatePositionSize).mockReturnValue(0);
        vi.mocked(adaptiveRiskModule.adaptiveRiskManager.calculateDynamicStopLoss).mockReturnValue({ stopLoss: 49500, takeProfit: 51000 });

        const config: any = {
            maxTradesPerWave: 1,
            fixedLotSizeBTC: 1.0,
            fixedLotSizeETH: 1.0,
            webhookUrl: 'http://127.0.0.1:3000',
            webhookSecret: 'mock',
            maxAllocationPerTradePercent: 5,
            adaptiveRiskEnabled: true,
            disableInitialSL: false,
        };

        const localOrchestrator = new ExecutionOrchestrator(config, true, addLogMock);
        vi.mocked(webhookService.sendToWebhook).mockResolvedValue({ success: true, message: 'ok' } as any);

        await localOrchestrator.executePlan([
            { asset: 'BTC-PERP', id: 'adaptive-sl', strategy: 'S1', direction: 'LONG', recommendedSize: 1.0, entry: 50000 }
        ] as any, { qualityScore: 92, volatility: 1.0, regime: 'MOMENTUM_TREND', dvol: 20, mtfStatus: { dailyTrend: 'UP', h4Regime: 'TREND', m15Trigger: true } } as any, 'ENTRY');

        const signalSent = vi.mocked(webhookService.sendToWebhook).mock.calls[0][0] as any;
        expect(signalSent.stopLoss).toBe(49500);
        expect(signalSent.takeProfit).toBe(51000);
        expect(signalSent.tp1).toBeDefined();
        expect(signalSent.tp2).toBe(51000);
    });

        it('should dispatch child orders sequentially', async () => {
        vi.mocked(riskLimitsService.getSnapshot).mockReturnValue({
            global: { maxDailyLoss: 1000 }, currentDailyPnL: 0, assets: {
                'BTC-PERP': { openPositions: 0, currentExposure: 0 }
            }
        } as any);
        
        // Prepare context where childOrderScheduler returns multiple slices
        const testSignal = {
            asset: 'BTC-PERP',
            strategy: 'TEST_STRAT',
            direction: 'LONG',
            entry: 50000,
            score: 95
        };
        const analysis = { qualityScore: 95, timestamp: Date.now(), regime: 'LOW_VOLATILITY', mtfStatus: { dailyTrend: 'UP', h4Trend: 'UP' } };
        
        // Let's mock the scheduler to return 3 slices of size 1.0, 1.0, 0.5
        vi.spyOn(childOrderSchedulerService, 'schedule').mockReturnValue([
            { symbol: 'BTC-PERP', strategy: 'TEST_STRAT', side: 'BUY', size: 1.0, executionStyle: 'AGGRESSIVE', routeHint: 'PRIMARY', sliceIndex: 0, totalSlices: 3 },
            { symbol: 'BTC-PERP', strategy: 'TEST_STRAT', side: 'BUY', size: 1.0, executionStyle: 'AGGRESSIVE', routeHint: 'PRIMARY', sliceIndex: 1, totalSlices: 3 },
            { symbol: 'BTC-PERP', strategy: 'TEST_STRAT', side: 'BUY', size: 0.5, executionStyle: 'AGGRESSIVE', routeHint: 'PRIMARY', sliceIndex: 2, totalSlices: 3 }
        ]);

        const testConfig = { webhookUrl: 'http://test.com', webhookSecret: 'secret', maxAllocationPerTradePercent: 5, fixedLotSizeBTC: 1, fixedLotSizeETH: 10, forceClosePnL: -1000, strategyBudgets: {}, maxParallelExecutions: 5, maxTradesPerWave: 5 } as any;
        const orchestrator = new ExecutionOrchestrator(testConfig, true, vi.fn());
        (orchestrator as any).addLog = vi.fn();
        await orchestrator.executePlan([testSignal] as any, analysis as any, 'ENTRY');

        // webhook should be called 3 times
        
        await new Promise(r => setTimeout(r, 100));
        // Reset webhook calls if they carried over
        // webhookService.sendToWebhook.mockClear(); 

        
        
        const currentCalls = vi.mocked(webhookService.sendToWebhook).mock.calls;
        console.log("webhook calls count:", currentCalls.length);

        expect(webhookService.sendToWebhook).toHaveBeenCalledTimes(3);

        const calls = vi.mocked(webhookService.sendToWebhook).mock.calls;
        
        // First call
        expect(calls[0][0].asset).toBe('BTC-PERP');
        expect((calls[0][0] as any).childOrder.sliceIndex).toBe(0);
        expect((calls[0][0] as any).size).toBe(1.0);
        expect(calls[0][4]).toBe(1.0); // executedLotSize arg

        // Second call
        expect((calls[1][0] as any).childOrder.sliceIndex).toBe(1);
        expect((calls[1][0] as any).size).toBe(1.0);

        // Third call
        expect((calls[2][0] as any).childOrder.sliceIndex).toBe(2);
        expect((calls[2][0] as any).size).toBe(0.5);
    });

});
