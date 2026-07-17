const fs = require('fs');

let code = fs.readFileSync('src/services/FullPipelineMultiWinner.e2e.test.ts', 'utf8');

const importStatement = `import { tailRiskModeService } from './TailRiskModeService';\n`;
if (!code.includes('TailRiskModeService')) {
    code = code.replace(/import { portfolioDrawdownFloorService } from '.\/PortfolioDrawdownFloorService';/, `import { portfolioDrawdownFloorService } from './PortfolioDrawdownFloorService';\n${importStatement}`);
}

const targetReset = `portfolioDrawdownFloorService.reset();`;
const replacementReset = `portfolioDrawdownFloorService.reset();
        tailRiskModeService.reset();`;
if (!code.includes('tailRiskModeService.reset()')) {
    code = code.replace(targetReset, replacementReset);
}

const testAdditions = `
    it('Scenario: Tail Risk Mode scales down sizes', async () => {
        tailRiskModeService.configure({
            enabled: true,
            tailScale: 0.2,
            autoTriggerFromDrawdown: false,
            autoTriggerFromVolSpike: false
        });
        // Manually trigger it
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
        
        await orchestrator.executePlan(signals, analysis, 'ENTRY');
        
        const call1Arg = vi.mocked(webhookService.sendToWebhook).mock.calls.find(call => call[0].id === 'mock-BTC_TREND')[0];
        const call2Arg = vi.mocked(webhookService.sendToWebhook).mock.calls.find(call => call[0].id === 'mock-BTC_MEAN_REV')[0];
        
        // Original expected sizes: BTC_TREND = 0.46875, BTC_MEAN_REV = 0.53125
        // After 0.2x scale:
        // BTC_TREND = 0.46875 * 0.2 = 0.09375 -> ~0.09
        // BTC_MEAN_REV = 0.53125 * 0.2 = 0.10625 -> ~0.11
        
        expect(call1Arg.recommendedSize).toBeCloseTo(0.09, 1);
        expect(call2Arg.recommendedSize).toBeCloseTo(0.11, 1);
    });

    it('Scenario: Tail Risk Mode blocks unallowed strategies', async () => {
        tailRiskModeService.configure({
            enabled: true,
            tailScale: 0.2,
            allowedStrategies: ['BTC_TREND'], // BTC_MEAN_REV will be blocked
            autoTriggerFromDrawdown: false,
            autoTriggerFromVolSpike: false
        });
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
        
        await orchestrator.executePlan(signals, analysis, 'ENTRY');
        
        const call1Arg = vi.mocked(webhookService.sendToWebhook).mock.calls.find(call => call[0].id === 'mock-BTC_TREND')[0];
        const call2Arg = vi.mocked(webhookService.sendToWebhook).mock.calls.find(call => call[0].id === 'mock-BTC_MEAN_REV');
        
        expect(call1Arg.recommendedSize).toBeCloseTo(0.09, 1);
        expect(call2Arg).toBeUndefined(); // It was blocked
    });
`;

if (!code.includes('Scenario: Tail Risk Mode scales down sizes')) {
    const endBracketIdx = code.lastIndexOf('});');
    if (endBracketIdx !== -1) {
        code = code.substring(0, endBracketIdx) + testAdditions + code.substring(endBracketIdx);
    }
}

fs.writeFileSync('src/services/FullPipelineMultiWinner.e2e.test.ts', code);
console.log('Patched FullPipelineMultiWinner.e2e.test.ts with Tail tests');
