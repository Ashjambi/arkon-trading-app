const fs = require('fs');
let code = fs.readFileSync('src/services/ExecutionOrchestrator.ts', 'utf8');

const importStatement = `import { executionStyleService } from './ExecutionStyleService';\n`;
if (!code.includes('ExecutionStyleService')) {
    code = code.replace(/import { tailRiskModeService } from '.\/TailRiskModeService';/, `import { tailRiskModeService } from './TailRiskModeService';\n${importStatement}`);
}

const target = `// --- PRE-TRADE RISK GUARD ---`;
const replacement = `// --- EXECUTION STYLE OVERLAY ---
        const styleContext = {
            signalQualityScore: analysis?.qualityScore || signalToSend.score || 0,
            volatilityRegime: analysis?.regime || 'UNKNOWN',
            stressScenarioEnabled: stressScenarioService.isStressScenarioEnabled ? stressScenarioService.isStressScenarioEnabled() : false,
            tailRiskMode: tailMode || 'NORMAL',
            drawdownMode: typeof drawdownMode !== 'undefined' ? drawdownMode : 'NORMAL'
        };

        const executionStyle = executionStyleService.decideStyle(styleContext);
        
        // Ensure executionStyle property exists on the signal, TS won't complain if cast to any
        (signalToSend as any).executionStyle = executionStyle;
        
        if (executionDecisionTraceService && executionDecisionTraceService.getLatestSnapshot()) {
            const trace = executionDecisionTraceService.getLatestSnapshot();
            if (trace && trace.executionDecision) {
                (trace.executionDecision as any).executionStyle = executionStyle;
            }
        }
        
        this.addLog(\`⚙️ [EXECUTION STYLE] نمط التنفيذ المختار: \${executionStyle}\`, 'EXEC');

        // --- PRE-TRADE RISK GUARD ---`;

if (!code.includes('EXECUTION STYLE OVERLAY')) {
    code = code.replace(target, replacement);
}

fs.writeFileSync('src/services/ExecutionOrchestrator.ts', code);
console.log('Patched ExecutionOrchestrator.ts with Execution Style');
