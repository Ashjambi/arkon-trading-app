const fs = require('fs');
let code = fs.readFileSync('src/services/ExecutionOrchestrator.ts', 'utf8');

const importStatement = `import { executionAnalyticsService } from './ExecutionAnalyticsService';\n`;
if (!code.includes('ExecutionAnalyticsService')) {
    code = code.replace(/import { smartOrderRouterService } from '.\/SmartOrderRouterService';/, `import { smartOrderRouterService } from './SmartOrderRouterService';\n${importStatement}`);
}

const target = `executionDecisionTraceService.recordPreTrade(true);`;
const replacement = `// --- EXECUTION ANALYTICS STUB ---
        const analyticsInput = {
            symbol: signalToSend.asset || 'UNKNOWN',
            strategy: signalToSend.strategy || 'UNKNOWN',
            side: (signalToSend.direction === 'LONG' || actionType === 'ENTRY') ? 'BUY' : 'SELL',
            requestedSize: candidate.size || 0,
            executedSize: executedLotSize,
            requestedPrice: signalToSend.entry,
            executedPrice: signalToSend.entry, // Placeholder assumption
            timestamp: new Date().toISOString(),
            executionStyle: (signalToSend as any).executionStyle || 'PASSIVE',
            routeHint: routeHint as any
        };
        const analyticsSnapshot = executionAnalyticsService.compute(analyticsInput as any);
        (signalToSend as any).executionAnalytics = analyticsSnapshot;

        if (executionDecisionTraceService && executionDecisionTraceService.getLatestSnapshot()) {
            const trace = executionDecisionTraceService.getLatestSnapshot();
            if (trace && trace.executionDecision) {
                (trace.executionDecision as any).executionAnalytics = analyticsSnapshot;
            }
        }

        executionDecisionTraceService.recordPreTrade(true);`;

if (!code.includes('EXECUTION ANALYTICS STUB')) {
    code = code.replace(target, replacement);
}

fs.writeFileSync('src/services/ExecutionOrchestrator.ts', code);
console.log('Patched ExecutionOrchestrator.ts with Analytics');
