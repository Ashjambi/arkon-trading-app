const fs = require('fs');

let code = fs.readFileSync('src/services/ExecutionOrchestrator.ts', 'utf8');

const importStatement = `import { portfolioDrawdownFloorService } from './PortfolioDrawdownFloorService';\n`;
if (!code.includes('PortfolioDrawdownFloorService')) {
    code = code.replace(/import { portfolioVolatilityTargetService } from '.\/PortfolioVolatilityTargetService';/, `import { portfolioVolatilityTargetService } from './PortfolioVolatilityTargetService';\n${importStatement}`);
}

const target = `// --- PRE-TRADE RISK GUARD ---`;
const replacement = `// --- PORTFOLIO DRAWDOWN FLOOR OVERLAY ---
        const drawdownScale = portfolioDrawdownFloorService.computeRiskScale();
        const drawdownMode = portfolioDrawdownFloorService.getCurrentMode();
        if (drawdownScale !== 1.0) {
            if (drawdownScale === 0.0) {
                executionDecisionTraceService.recordBlock('PORTFOLIO_DRAWDOWN', \`Blocked due to \${drawdownMode}\`);
                this.addLog(\`⛔ [PORTFOLIO DRAWDOWN] تم منع تنفيذ الصفقة بسبب التراجع الشديد (\${drawdownMode})\`, 'SYSTEM');
                return false;
            }

            let scaledSize = executedLotSize * drawdownScale;
            this.addLog(\`📉 [PORTFOLIO DRAWDOWN] تم تعديل الحجم بمعامل \${drawdownScale.toFixed(2)} ليصبح \${scaledSize.toFixed(3)} (الوضع: \${drawdownMode})\`, 'RISK');
            executedLotSize = Math.max(MIN_BROKER_LOT, Number(scaledSize.toFixed(2)));
            signalToSend.recommendedSize = executedLotSize;

            if (executionDecisionTraceService && executionDecisionTraceService.getLatestSnapshot()) {
                const trace = executionDecisionTraceService.getLatestSnapshot();
                if (trace && trace.executionDecision) {
                    (trace.executionDecision as any).portfolioDrawdownScale = drawdownScale;
                    (trace.executionDecision as any).portfolioDrawdownMode = drawdownMode;
                }
            }
        }

        // --- PRE-TRADE RISK GUARD ---`;

if (!code.includes('PORTFOLIO DRAWDOWN FLOOR OVERLAY')) {
    code = code.replace(target, replacement);
}

fs.writeFileSync('src/services/ExecutionOrchestrator.ts', code);
console.log('Patched ExecutionOrchestrator.ts');
