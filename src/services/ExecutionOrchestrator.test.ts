import { childOrderSchedulerService } from './ChildOrderSchedulerService';
import * as webhookService from './webhookService';

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ExecutionOrchestrator } from './ExecutionOrchestrator';
import { riskLimitsService } from './RiskLimitsService';
import { preTradeRiskGuard } from './PreTradeRiskGuard';

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

vi.mock('./telegramService', () => ({
    sendSignalToTelegram: vi.fn(),
    sendTradeExecutionAlertToTelegram: vi.fn()
}));

vi.mock('./webhookService', () => ({
    sendToWebhook: vi.fn(),
    checkBridgeStatus: vi.fn()
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
        
        // Use require() to mock internal webhook call within the file? No, we mocked the module
        webhookService.sendToWebhook.mockResolvedValue({ success: true, message: 'OK' });
        webhookService.sendToWebhook.mockClear();
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
        const firstCallArg = webhookService.sendToWebhook.mock.calls[0][0];
        expect(firstCallArg.recommendedSize).toBe(0.5);
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
        const orchestrator = new ExecutionOrchestrator(testConfig);
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
