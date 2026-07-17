const fs = require('fs');
let code = fs.readFileSync('src/services/FullPipelineMultiWinner.e2e.test.ts', 'utf8');

const importStatement = `import { portfolioVolatilityTargetService } from './PortfolioVolatilityTargetService';\n`;
if (!code.includes('PortfolioVolatilityTargetService')) {
    code = code.replace(/import { strategyRiskBudgetService } from '.\/StrategyRiskBudgetService';/, `import { strategyRiskBudgetService } from './StrategyRiskBudgetService';\n${importStatement}`);
}

const targetReset = `strategyRiskBudgetService.resetBudgets();`;
const replacementReset = `strategyRiskBudgetService.resetBudgets();
        portfolioVolatilityTargetService.reset();`;
if (!code.includes('portfolioVolatilityTargetService.reset()')) {
    code = code.replace(targetReset, replacementReset);
}

const testAdditions = `
    it('Scenario: Portfolio Volatility Target scales UP but respects budget', async () => {
        // Strategy budget is 0.7 for BTC_TREND
        strategyRiskBudgetService.configureBudget('BTC_TREND', 0.7);
        
        // Volatility target is configured to scale UP by 2x
        portfolioVolatilityTargetService.configure({ targetVol: 0.10, minScale: 0.5, maxScale: 2.0 });
        portfolioVolatilityTargetService.updateVolEstimate(0.05); // scale = 2.0
        
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
        // After 2x scale:
        // BTC_TREND = 0.46875 * 2 = 0.9375 -> bounded to 0.7 (strategy budget)
        // BTC_MEAN_REV = 0.53125 * 2 = 1.0625 -> no budget configured, so 1.06 (with rounding maybe 1.06)
        
        expect(call1Arg.recommendedSize).toBeCloseTo(0.7);
        expect(call2Arg.recommendedSize).toBeCloseTo(1.06, 1);
    });

    it('Scenario: Portfolio Volatility Target scales DOWN', async () => {
        // Volatility target is configured to scale DOWN by 0.5x
        portfolioVolatilityTargetService.configure({ targetVol: 0.10, minScale: 0.5, maxScale: 2.0 });
        portfolioVolatilityTargetService.updateVolEstimate(0.20); // scale = 0.5
        
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
        // After 0.5x scale:
        // BTC_TREND = 0.46875 * 0.5 = 0.234375 -> rounded down to 0.23
        // BTC_MEAN_REV = 0.53125 * 0.5 = 0.265625 -> rounded down to 0.27
        
        expect(call1Arg.recommendedSize).toBeCloseTo(0.23, 1);
        expect(call2Arg.recommendedSize).toBeCloseTo(0.27, 1);
    });

    it('Scenario: Reset restores baseline behavior', async () => {
        portfolioVolatilityTargetService.configure({ targetVol: 0.10, minScale: 0.5, maxScale: 2.0 });
        portfolioVolatilityTargetService.updateVolEstimate(0.20); // scale = 0.5
        portfolioVolatilityTargetService.reset(); // Should revert to 1.0
        
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
        
        // Original expected size: 0.46875
        expect(call1Arg.recommendedSize).toBeCloseTo(0.46875);
    });
`;

if (!code.includes('Scenario: Portfolio Volatility Target scales UP but respects budget')) {
    const endBracketIdx = code.lastIndexOf('});');
    if (endBracketIdx !== -1) {
        code = code.substring(0, endBracketIdx) + testAdditions + code.substring(endBracketIdx);
    }
}

fs.writeFileSync('src/services/FullPipelineMultiWinner.e2e.test.ts', code);
console.log('Patched FullPipelineMultiWinner.e2e.test.ts with vol tests');
