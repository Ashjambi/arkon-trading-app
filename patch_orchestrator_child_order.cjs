const fs = require('fs');
let code = fs.readFileSync('src/services/ExecutionOrchestrator.ts', 'utf8');

const importStatement = `import { childOrderSchedulerService } from './ChildOrderSchedulerService';\n`;
if (!code.includes('childOrderSchedulerService')) {
    code = code.replace(/import { executionAnalyticsService } from '.\/ExecutionAnalyticsService';/, `${importStatement}import { executionAnalyticsService } from './ExecutionAnalyticsService';`);
}

const target = `// --- EXECUTION ANALYTICS STUB ---`;
const replacement = `// --- CHILD ORDER SCHEDULING STUB ---
        const parentOrder = {
            symbol: signalToSend.asset || 'UNKNOWN',
            strategy: signalToSend.strategy || 'UNKNOWN',
            side: (signalToSend.direction === 'LONG' || actionType === 'ENTRY') ? 'BUY' : 'SELL' as 'BUY'|'SELL',
            totalSize: executedLotSize,
            executionStyle: (signalToSend as any).executionStyle || 'PASSIVE',
            routeHint: routeHint as any
        };
        const childOrders = childOrderSchedulerService.schedule(parentOrder);
        (signalToSend as any).childOrders = childOrders;

        if (executionDecisionTraceService && executionDecisionTraceService.getLatestSnapshot()) {
            const trace = executionDecisionTraceService.getLatestSnapshot();
            if (trace && trace.executionDecision) {
                (trace.executionDecision as any).childOrdersSummary = {
                    totalSlices: childOrders.length,
                    sizes: childOrders.map(c => c.size)
                };
            }
        }

        // --- EXECUTION ANALYTICS STUB ---`;

if (!code.includes('CHILD ORDER SCHEDULING STUB')) {
    code = code.replace(target, replacement);
}

fs.writeFileSync('src/services/ExecutionOrchestrator.ts', code);
console.log('Patched ExecutionOrchestrator.ts with Child Order Scheduling');
