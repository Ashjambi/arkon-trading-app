const fs = require('fs');

let code = fs.readFileSync('src/services/FullPipelineMultiWinner.e2e.test.ts', 'utf8');

const importStatement = `import { executionStyleService } from './ExecutionStyleService';\n`;
if (!code.includes('ExecutionStyleService')) {
    code = code.replace(/import { tailRiskModeService } from '.\/TailRiskModeService';/, `import { tailRiskModeService } from './TailRiskModeService';\n${importStatement}`);
}

const testAdditions = `
    it('Scenario: ExecutionStyleService assigns AGGRESSIVE style for strong signals in low vol', async () => {
        const summary = { instrument_name: 'BTC-PERP', last: 50000, funding_8h: 0 } as any;
        // Low vol -> volume=1, small high/low diff
        const candles15M = {
            status: 'ok',
            close: Array(50).fill(50000),
            high: Array(50).fill(50010),
            low: Array(50).fill(49990),
            open: Array(50).fill(50000),
            volume: Array(50).fill(1)
        } as any;
        
        const { signals, analysis } = generateSignal(
            'BTC-PERP',
            summary,
            [summary],
            null,
            candles15M,
            candles15M,
            null,
            5,
            100,
            config,
            []
        );
        
        // Ensure analysis thinks it's LOW_VOLATILITY or HIGH...
        // Actually generateSignal might return UNKNOWN. We will manually set analysis.regime if needed.
        if (analysis) {
             analysis.regime = 'LOW_VOLATILITY';
             analysis.qualityScore = 85;
        }
        
        await orchestrator.executePlan(signals, analysis, 'ENTRY');
        
        const call1Arg = vi.mocked(webhookService.sendToWebhook).mock.calls.find(call => call[0].id === 'mock-BTC_TREND')[0];
        
        expect((call1Arg as any).executionStyle).toBe('AGGRESSIVE');
    });

    it('Scenario: ExecutionStyleService assigns PASSIVE style in TAIL_RISK mode', async () => {
        tailRiskModeService.configure({ enabled: true, tailScale: 0.5, autoTriggerFromDrawdown: false, autoTriggerFromVolSpike: false });
        tailRiskModeService['mode'] = 'TAIL_RISK';
        
        const summary = { instrument_name: 'BTC-PERP', last: 50000, funding_8h: 0 } as any;
        const candles15M = {
            status: 'ok',
            close: Array(50).fill(50000),
            high: Array(50).fill(50100),
            low: Array(50).fill(49900),
            open: Array(50).fill(50000),
            volume: Array(50).fill(10)
        } as any;
        
        const { signals, analysis } = generateSignal(
            'BTC-PERP',
            summary,
            [summary],
            null,
            candles15M,
            candles15M,
            null,
            5,
            100,
            config,
            []
        );
        
        if (analysis) {
             analysis.qualityScore = 95;
             analysis.regime = 'LOW_VOLATILITY';
        }
        
        await orchestrator.executePlan(signals, analysis, 'ENTRY');
        
        const call1Arg = vi.mocked(webhookService.sendToWebhook).mock.calls.find(call => call[0].id === 'mock-BTC_TREND')[0];
        
        expect((call1Arg as any).executionStyle).toBe('PASSIVE');
    });
`;

if (!code.includes('ExecutionStyleService assigns AGGRESSIVE')) {
    const endBracketIdx = code.lastIndexOf('});');
    if (endBracketIdx !== -1) {
        code = code.substring(0, endBracketIdx) + testAdditions + code.substring(endBracketIdx);
    }
}

fs.writeFileSync('src/services/FullPipelineMultiWinner.e2e.test.ts', code);
console.log('Patched FullPipelineMultiWinner.e2e.test.ts with Style tests');
