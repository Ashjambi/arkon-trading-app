const fs = require('fs');
const path = './src/services/ExecutionOrchestrator.test.ts';
let code = fs.readFileSync(path, 'utf8');

if (!code.includes('PreTradeRiskGuard')) {
    code = code.replace(`import { ExecutionOrchestrator } from './ExecutionOrchestrator';`, `import { ExecutionOrchestrator } from './ExecutionOrchestrator';\nimport { preTradeRiskGuard } from './PreTradeRiskGuard';`);

    const newTests = `
    it('8. orchestrator blocks when preTradeRiskGuard fails', async () => {
        const mockLog = vi.fn();
        const config = {
            webhookUrl: '',
            webhookSecret: '',
            autoExecution: true,
            maxAllocationPerTradePercent: 5,
            fixedLotSizeBTC: 1000, // Very large to trigger BLOCKED_SIZE
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
`;

    code = code.replace(`});`, `${newTests}});\n`);
    fs.writeFileSync(path, code);
}
