const fs = require('fs');

let code = fs.readFileSync('src/services/FullPipelineMultiWinner.e2e.test.ts', 'utf8');

const importStatement = `import { strategyRiskBudgetAllocatorService } from './StrategyRiskBudgetAllocatorService';\n`;
if (!code.includes('StrategyRiskBudgetAllocatorService')) {
    code = code.replace(/import { tailRiskModeService } from '.\/TailRiskModeService';/, `import { tailRiskModeService } from './TailRiskModeService';\n${importStatement}`);
}

const targetReset = `tailRiskModeService.reset();`;
const replacementReset = `tailRiskModeService.reset();
        strategyRiskBudgetAllocatorService.reset();`;
if (!code.includes('strategyRiskBudgetAllocatorService.reset()')) {
    code = code.replace(targetReset, replacementReset);
}

const testAdditions = `
    it('Scenario: StrategyRiskBudgetAllocatorService redistributes budget', async () => {
        strategyRiskBudgetService.resetBudgets();
        
        strategyRiskBudgetAllocatorService.configure({
            totalRiskBudget: 1.0,
            minStrategyBudget: 0.2,
            maxStrategyBudget: 0.8
        });
        
        strategyRiskBudgetAllocatorService.updatePerformanceSnapshots([
            { strategy: 'BTC_TREND', rollingReturn: 0.20 },
            { strategy: 'BTC_MEAN_REV', rollingReturn: 0.00 }
        ]);
        
        strategyRiskBudgetAllocatorService.computeAndApplyBudgets();
        
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
        
        // BTC_TREND normally ~0.46. Its budget is 0.8, so it's fully allowed
        expect(call1Arg.recommendedSize).toBeCloseTo(0.46875, 2);
        
        // BTC_MEAN_REV normally ~0.53. Its budget is clamped to ~0.2, so it's restricted
        expect(call2Arg.recommendedSize).toBeLessThan(0.3);
    });
`;

if (!code.includes('Scenario: StrategyRiskBudgetAllocatorService redistributes budget')) {
    const endBracketIdx = code.lastIndexOf('});');
    if (endBracketIdx !== -1) {
        code = code.substring(0, endBracketIdx) + testAdditions + code.substring(endBracketIdx);
    }
}

fs.writeFileSync('src/services/FullPipelineMultiWinner.e2e.test.ts', code);
console.log('Patched FullPipelineMultiWinner.e2e.test.ts with Allocator tests');
