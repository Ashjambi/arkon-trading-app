const fs = require('fs');
const path = './src/services/ExecutionOrchestrator.test.ts';
let code = fs.readFileSync(path, 'utf8');

if (!code.includes('orchestrator blocks when riskLimitsService denies entry')) {
    const newTests = `
    it('9. orchestrator blocks when riskLimitsService denies entry', async () => {
        const mockLog = vi.fn();
        const config = {
            webhookUrl: '',
            webhookSecret: '',
            autoExecution: true,
            maxAllocationPerTradePercent: 5,
            fixedLotSizeBTC: 11, // BTC max is 10
            fixedLotSizeETH: 0.2
        } as any;
        const orchestrator = new ExecutionOrchestrator(config, true, mockLog);
        
        const signal = {
            asset: 'BTC-PERPETUAL',
            direction: 'LONG',
            entry: 50000,
            strategy: 'BTC_SCALPER'
        };
        const analysis = {
            timestamp: Date.now(),
            mtfStatus: {
                dailyTrend: 'UP',
                h4Regime: 'TRENDING'
            }
        };

        const result = await orchestrator.executeSignal(signal, analysis as any);
        expect(result).toBe(false);
        expect(mockLog).toHaveBeenCalledWith(
            expect.stringContaining('[PRE-TRADE BLOCKED]'),
            'SYSTEM'
        );
    });

    it('10. RISK-REDUCING order passes even if limits are tight', async () => {
        const mockLog = vi.fn();
        const config = {
            webhookUrl: '',
            webhookSecret: '',
            autoExecution: true,
            maxAllocationPerTradePercent: 5,
            fixedLotSizeBTC: 11, // Normally exceeds limit, but we pass isRiskReducing
            fixedLotSizeETH: 0.2
        } as any;
        const orchestrator = new ExecutionOrchestrator(config, true, mockLog);
        
        const signal = {
            asset: 'BTC-PERPETUAL',
            direction: 'SHORT',
            entry: 5000, // Small price so notional isn't blocked
            strategy: 'BTC_SCALPER'
        };
        const analysis = {
            timestamp: Date.now(),
            mtfStatus: {
                dailyTrend: 'UP',
                h4Regime: 'TRENDING'
            }
        };

        const result = await orchestrator.executeSignal(signal, analysis as any, 'EXIT');
        // Will fail at webhook step (network), but should pass pre-trade risk!
        // The orchestration returns false because webhook mock isn't provided here,
        // but it should NOT have "[PRE-TRADE BLOCKED]" log.
        expect(mockLog).not.toHaveBeenCalledWith(
            expect.stringContaining('[PRE-TRADE BLOCKED]'),
            'SYSTEM'
        );
    });
`;

    code = code.replace(`});\n});`, `${newTests}});\n});`);
    fs.writeFileSync(path, code);
}
