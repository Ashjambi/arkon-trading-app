const fs = require('fs');
let code = fs.readFileSync('src/services/FullPipelineMultiWinner.e2e.test.ts', 'utf8');

const tcaTest = `
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
`;

code = code.replace(/}\);\n}\);/g, "});\n" + tcaTest);

fs.writeFileSync('src/services/FullPipelineMultiWinner.e2e.test.ts', code);
