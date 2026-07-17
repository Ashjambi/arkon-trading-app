const fs = require('fs');

let code = fs.readFileSync('src/services/FullPipelineMultiWinner.e2e.test.ts', 'utf8');

const importStatement = `import { portfolioDrawdownFloorService } from './PortfolioDrawdownFloorService';\n`;
if (!code.includes('PortfolioDrawdownFloorService')) {
    code = code.replace(/import { portfolioVolatilityTargetService } from '.\/PortfolioVolatilityTargetService';/, `import { portfolioVolatilityTargetService } from './PortfolioVolatilityTargetService';\n${importStatement}`);
}

const targetReset = `portfolioVolatilityTargetService.reset();`;
const replacementReset = `portfolioVolatilityTargetService.reset();
        portfolioDrawdownFloorService.reset();`;
if (!code.includes('portfolioDrawdownFloorService.reset()')) {
    code = code.replace(targetReset, replacementReset);
}

const testAdditions = `
    it('Scenario: Portfolio Drawdown soft limit scales down sizes', async () => {
        portfolioDrawdownFloorService.configure({
            maxDrawdownLimit: 0.20,
            softDrawdownLimit: 0.10,
            floorLevel: 0.85,
            hardStopEnabled: true
        });
        portfolioDrawdownFloorService.updateEquity(10000);
        portfolioDrawdownFloorService.updateEquity(8800); // 12% drop -> SOFT_DRAWDOWN, scale = 1 - 0.12/0.2 = 0.4
        
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
        // After 0.4x scale:
        // BTC_TREND = 0.46875 * 0.4 = 0.1875 -> ~0.19
        // BTC_MEAN_REV = 0.53125 * 0.4 = 0.2125 -> ~0.21
        
        expect(call1Arg.recommendedSize).toBeCloseTo(0.19, 1);
        expect(call2Arg.recommendedSize).toBeCloseTo(0.21, 1);
    });

    it('Scenario: Portfolio Drawdown hard limit blocks execution', async () => {
        portfolioDrawdownFloorService.configure({
            maxDrawdownLimit: 0.20,
            softDrawdownLimit: 0.10,
            floorLevel: 0.85,
            hardStopEnabled: true
        });
        portfolioDrawdownFloorService.updateEquity(10000);
        portfolioDrawdownFloorService.updateEquity(7000); // 30% drop -> HARD_DRAWDOWN, scale = 0.0
        
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
        
        const anySuccess = await orchestrator.executePlan(signals, analysis, 'ENTRY');
        expect(anySuccess).toBe(false);
        expect(vi.mocked(webhookService.sendToWebhook)).not.toHaveBeenCalled();
    });
`;

if (!code.includes('Scenario: Portfolio Drawdown soft limit scales down sizes')) {
    const endBracketIdx = code.lastIndexOf('});');
    if (endBracketIdx !== -1) {
        code = code.substring(0, endBracketIdx) + testAdditions + code.substring(endBracketIdx);
    }
}

fs.writeFileSync('src/services/FullPipelineMultiWinner.e2e.test.ts', code);
console.log('Patched FullPipelineMultiWinner.e2e.test.ts with DD tests');
