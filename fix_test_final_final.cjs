const fs = require('fs');
let code = fs.readFileSync('src/services/FullPipelineMultiWinner.e2e.test.ts', 'utf8');

// Fix the ALT-PERP signal injection inside the PRIMARY test
code = code.replace(/it\('Scenario: SmartOrderRouterService assigns PRIMARY[\s\S]*?routeHint\)\.toBe\('PRIMARY'\);\n    \}\);/m, 
`it('Scenario: SmartOrderRouterService assigns PRIMARY route for BTC in low vol (HIGH liquidity, AGGRESSIVE)', async () => {
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
        
        await orchestrator.executePlan(signals, analysis, 'ENTRY');
        
        const call1Arg = vi.mocked(webhookService.sendToWebhook).mock.calls.find(call => call[0].id === 'mock-BTC_TREND')[0];
        
        // BTC is heuristically high liquidity. Strong signal -> AGGRESSIVE -> PRIMARY
        expect((call1Arg as any).executionStyle).toBe('AGGRESSIVE');
        expect((call1Arg as any).routeHint).toBe('PRIMARY');
    });`);

// Fix the ALT-PERP test to have [0] and set ALT-PERP properly
code = code.replace(/it\('Scenario: SmartOrderRouterService assigns SECONDARY[\s\S]*?routeHint\)\.toBe\('SECONDARY'\);\n        \}\n    \}\);/m, 
`it('Scenario: SmartOrderRouterService assigns SECONDARY route for ALT in low vol (MEDIUM liquidity, AGGRESSIVE)', async () => {
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
             signals.forEach(s => s.asset = 'ALT-PERP'); // Force ALT-PERP
        }
        
        await orchestrator.executePlan(signals, analysis, 'ENTRY');
        
        const call1Arg = vi.mocked(webhookService.sendToWebhook).mock.calls.find(call => call[0].id === 'mock-BTC_TREND')[0];
        
        expect((call1Arg as any).executionStyle).toBe('AGGRESSIVE');
        expect((call1Arg as any).routeHint).toBe('SECONDARY');
    });`);

fs.writeFileSync('src/services/FullPipelineMultiWinner.e2e.test.ts', code);
console.log('Fixed');
