const fs = require('fs');
let code = fs.readFileSync('src/services/ExecutionOrchestrator.ts', 'utf8');

const importStatement = `import { tailRiskModeService } from './TailRiskModeService';\n`;
if (!code.includes('TailRiskModeService')) {
    code = code.replace(/import { portfolioDrawdownFloorService } from '.\/PortfolioDrawdownFloorService';/, `import { portfolioDrawdownFloorService } from './PortfolioDrawdownFloorService';\n${importStatement}`);
}

const target = `// --- PRE-TRADE RISK GUARD ---`;
const replacement = `// --- TAIL RISK MODE OVERLAY ---
        const tailMode = tailRiskModeService.getMode();
        const tailScale = tailRiskModeService.getTailScale();
        
        if (tailMode === 'TAIL_RISK') {
            if (!tailRiskModeService.shouldAllowStrategy(strategyName)) {
                executionDecisionTraceService.recordBlock('TAIL_RISK', \`Strategy \${strategyName} blocked in TAIL_RISK mode\`);
                this.addLog(\`⛔ [TAIL RISK] تم منع تنفيذ الاستراتيجية \${strategyName} لأنها غير مصرح بها أثناء وضع الطوارئ.\`, 'SYSTEM');
                return false;
            }
        }
        
        if (tailScale !== 1.0) {
            if (tailScale === 0.0) {
                executionDecisionTraceService.recordBlock('TAIL_RISK', \`Blocked due to TAIL_RISK scale 0.0\`);
                this.addLog(\`⛔ [TAIL RISK] تم منع تنفيذ الصفقة بسبب وضع الطوارئ (المعامل 0)\`, 'SYSTEM');
                return false;
            }

            let scaledSize = executedLotSize * tailScale;
            this.addLog(\`🚨 [TAIL RISK] تم تعديل الحجم بمعامل \${tailScale.toFixed(2)} ليصبح \${scaledSize.toFixed(3)} (الوضع: \${tailMode})\`, 'RISK');
            executedLotSize = Math.max(MIN_BROKER_LOT, Number(scaledSize.toFixed(2)));
            signalToSend.recommendedSize = executedLotSize;

            if (executionDecisionTraceService && executionDecisionTraceService.getLatestSnapshot()) {
                const trace = executionDecisionTraceService.getLatestSnapshot();
                if (trace && trace.executionDecision) {
                    (trace.executionDecision as any).tailRiskScale = tailScale;
                    (trace.executionDecision as any).tailRiskMode = tailMode;
                }
            }
        }

        // --- PRE-TRADE RISK GUARD ---`;

if (!code.includes('TAIL RISK MODE OVERLAY')) {
    code = code.replace(target, replacement);
}

fs.writeFileSync('src/services/ExecutionOrchestrator.ts', code);
console.log('Patched ExecutionOrchestrator.ts');
