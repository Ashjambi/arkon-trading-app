const fs = require('fs');

let code = fs.readFileSync('src/services/ExecutionOrchestrator.ts', 'utf8');

const importStatement = `import { portfolioVolatilityTargetService } from './PortfolioVolatilityTargetService';\n`;
if (!code.includes('PortfolioVolatilityTargetService')) {
    code = code.replace(/import { strategyRiskBudgetService } from '.\/StrategyRiskBudgetService';/, `import { strategyRiskBudgetService } from './StrategyRiskBudgetService';\n${importStatement}`);
}

const target = `// --- PRE-TRADE RISK GUARD ---`;
const replacement = `// --- PORTFOLIO VOLATILITY TARGET OVERLAY ---
        const volScale = portfolioVolatilityTargetService.computeScale();
        if (volScale !== 1.0) {
            let scaledSize = executedLotSize * volScale;
            this.addLog(\`📊 [PORTFOLIO VOLATILITY] تم تعديل الحجم بمعامل \${volScale.toFixed(2)} ليصبح \${scaledSize.toFixed(3)}\`, 'RISK');
            
            if (volScale > 1.0) {
                const reCheck = strategyRiskBudgetService.canAllocate(strategyName, scaledSize);
                if (reCheck.approvedSize < scaledSize) {
                    this.addLog(\`⚠️ [PORTFOLIO VOLATILITY] تم تقليص الحجم من \${scaledSize.toFixed(3)} إلى \${reCheck.approvedSize.toFixed(3)} لاحترام ميزانية الاستراتيجية.\`, 'RISK');
                    scaledSize = reCheck.approvedSize;
                }
            }

            executedLotSize = Math.max(MIN_BROKER_LOT, Number(scaledSize.toFixed(2)));
            signalToSend.recommendedSize = executedLotSize;
            
            if (executionDecisionTraceService && executionDecisionTraceService.getLatestSnapshot()) {
                const trace = executionDecisionTraceService.getLatestSnapshot();
                if (trace && trace.executionDecision) {
                    (trace.executionDecision as any).portfolioVolatilityScale = volScale;
                }
            }
        }

        // --- PRE-TRADE RISK GUARD ---`;

if (!code.includes('PORTFOLIO VOLATILITY TARGET OVERLAY')) {
    code = code.replace(target, replacement);
}

fs.writeFileSync('src/services/ExecutionOrchestrator.ts', code);
console.log('Patched ExecutionOrchestrator.ts');
