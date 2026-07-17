const fs = require('fs');

let code = fs.readFileSync('src/services/FullPipelineMultiWinner.e2e.test.ts', 'utf8');

const importStatement = `import { strategyRiskBudgetService } from './StrategyRiskBudgetService';\n`;
if (!code.includes('StrategyRiskBudgetService')) {
    code = code.replace(/import { AppConfig } from '..\/types';/, `import { AppConfig } from '../types';\n${importStatement}`);
}

const target = `orchestrator = new ExecutionOrchestrator(config, true, addLogMock);`;
const replacement = `orchestrator = new ExecutionOrchestrator(config, true, addLogMock);
        strategyRiskBudgetService.resetBudgets();`;

if (!code.includes('strategyRiskBudgetService.resetBudgets()')) {
    code = code.replace(target, replacement);
}

const testAddition = `
    it('Scenario: Strategy Risk Budget partially scales execution', async () => {
        // Budget only allows 0.3 for BTC_TREND
        strategyRiskBudgetService.configureBudget('BTC_TREND', 0.3);
        
        // Prepare inputs for generateSignal
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
        // BTC_TREND is capped at 0.3
        expect(call1Arg.recommendedSize).toBeCloseTo(0.3);
        expect(call2Arg.recommendedSize).toBeCloseTo(0.53125); // unchanged
    });

    it('Scenario: Strategy Risk Budget fully blocks execution', async () => {
        // Exhaust budget for BTC_TREND
        strategyRiskBudgetService.configureBudget('BTC_TREND', 1.0);
        strategyRiskBudgetService.registerAllocation('BTC_TREND', 1.0);
        
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
        
        vi.mocked(webhookService.sendToWebhook).mockClear();
        await orchestrator.executePlan(signals, analysis, 'ENTRY');
        
        // BTC_TREND should be skipped, so only 1 call
        expect(webhookService.sendToWebhook).toHaveBeenCalledTimes(1);
        
        const call1Arg = vi.mocked(webhookService.sendToWebhook).mock.calls[0][0];
        expect(call1Arg.id).toBe('mock-BTC_MEAN_REV');
        expect(call1Arg.recommendedSize).toBeCloseTo(0.53125);
    });
`;

if (!code.includes('Scenario: Strategy Risk Budget partially scales execution')) {
    const endBracketIdx = code.lastIndexOf('});');
    if (endBracketIdx !== -1) {
        code = code.substring(0, endBracketIdx) + testAddition + code.substring(endBracketIdx);
    }
}

fs.writeFileSync('src/services/FullPipelineMultiWinner.e2e.test.ts', code);
console.log('Patched FullPipelineMultiWinner.e2e.test.ts');
