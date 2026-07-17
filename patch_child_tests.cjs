const fs = require('fs');

let code = fs.readFileSync('src/services/FullPipelineMultiWinner.e2e.test.ts', 'utf8');

const testAdditions = `
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
        
        await orchestrator.executePlan(signals, analysis, 'ENTRY');
        
        const call1Arg = vi.mocked(webhookService.sendToWebhook).mock.calls.find(call => call[0].id === 'mock-BTC_TREND')[0];
        
        expect((call1Arg as any).childOrders).toBeDefined();
        expect(Array.isArray((call1Arg as any).childOrders)).toBe(true);
        expect((call1Arg as any).childOrders.length).toBeGreaterThan(0);
        expect((call1Arg as any).childOrders[0].sliceIndex).toBe(0);
        expect((call1Arg as any).childOrders[0].totalSlices).toBe((call1Arg as any).childOrders.length);
    });
`;

if (!code.includes('ChildOrderSchedulerService attaches childOrders')) {
    const endBracketIdx = code.lastIndexOf('});');
    if (endBracketIdx !== -1) {
        code = code.substring(0, endBracketIdx) + testAdditions + code.substring(endBracketIdx);
    }
}

fs.writeFileSync('src/services/FullPipelineMultiWinner.e2e.test.ts', code);
console.log('Patched FullPipelineMultiWinner.e2e.test.ts with ChildOrderScheduler tests');
