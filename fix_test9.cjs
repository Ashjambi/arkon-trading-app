const fs = require('fs');
let code = fs.readFileSync('src/services/ExecutionOrchestrator.test.ts', 'utf8');

code = code.replace(/vi.mocked\(riskLimitsService\.getSnapshot\)\.mockReturnValue\(\{/g, "vi.mocked(riskLimitsService.getSnapshot).mockReturnValue({");
const newTest = `    it('should dispatch child orders sequentially', async () => {
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
        orchestrator.addLog = vi.fn();
        await orchestrator.executePlan([testSignal] as any, analysis as any, 'ENTRY');

        // webhook should be called 3 times
        await new Promise(r => setTimeout(r, 100));
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
`;
code = code.replace(/it\('should dispatch child orders sequentially', async \(\) => \{[\s\S]*?\}\);/g, newTest);
fs.writeFileSync('src/services/ExecutionOrchestrator.test.ts', code);
console.log('Fixed execution logic');
