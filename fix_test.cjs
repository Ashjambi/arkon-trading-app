const fs = require('fs');
let fp = fs.readFileSync('src/services/FullPipelineMultiWinner.e2e.test.ts', 'utf8');

const tcaTest = `
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
});
`;

fp = fp.replace(/}\);\n}\);/g, "});\n" + tcaTest);

fs.writeFileSync('src/services/FullPipelineMultiWinner.e2e.test.ts', fp);
