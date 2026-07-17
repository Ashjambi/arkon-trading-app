const fs = require('fs');
let code = fs.readFileSync('src/services/ExecutionOrchestrator.ts', 'utf8');

const importStatement = `import { smartOrderRouterService } from './SmartOrderRouterService';\n`;
if (!code.includes('SmartOrderRouterService')) {
    code = code.replace(/import { executionStyleService } from '.\/ExecutionStyleService';/, `import { executionStyleService } from './ExecutionStyleService';\n${importStatement}`);
}

const target = `executionDecisionTraceService.recordPreTrade(true);`;
const replacement = `// --- SMART ORDER ROUTING STUB ---
        const routingContext = {
            symbol: signalToSend.asset || 'UNKNOWN',
            instrumentType: (signalToSend.asset && !signalToSend.asset.includes('PERP')) ? 'EQUITY' : 'CRYPTO', // Basic heuristic
            notional: executedLotSize * (signalToSend.entry || 0),
            executionStyle: (signalToSend as any).executionStyle || 'PASSIVE',
            liquidityTier: (signalToSend.asset && signalToSend.asset.includes('BTC')) ? 'HIGH' : 'MEDIUM'
        };
        const routeHint = smartOrderRouterService.decideRoute(routingContext as any);
        (signalToSend as any).routeHint = routeHint;
        
        if (executionDecisionTraceService && executionDecisionTraceService.getLatestSnapshot()) {
            const trace = executionDecisionTraceService.getLatestSnapshot();
            if (trace && trace.executionDecision) {
                (trace.executionDecision as any).routeHint = routeHint;
            }
        }
        
        this.addLog(\`🛤️ [ROUTING] مسار التنفيذ المختار: \${routeHint}\`, 'EXEC');

        executionDecisionTraceService.recordPreTrade(true);`;

if (!code.includes('SMART ORDER ROUTING STUB')) {
    code = code.replace(target, replacement);
}

fs.writeFileSync('src/services/ExecutionOrchestrator.ts', code);
console.log('Patched ExecutionOrchestrator.ts with SOR');
