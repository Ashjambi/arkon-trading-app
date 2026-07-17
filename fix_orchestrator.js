const fs = require('fs');
let code = fs.readFileSync('src/services/ExecutionOrchestrator.ts', 'utf8');

if (!code.includes("executionTcaAggregatorService")) {
    code = code.replace(/import \{ executionAnalyticsService \} from '\.\/ExecutionAnalyticsService';/,
    "import { executionAnalyticsService } from './ExecutionAnalyticsService';\nimport { executionTcaAggregatorService, ChildExecutionTcaInput } from './ExecutionTcaAggregatorService';");
}

const childLoopSearch = `        let allSuccess = true;
        for (const child of childOrders) {`;

const childLoopReplace = `        let allSuccess = true;
        const childTcaInputs: ChildExecutionTcaInput[] = [];

        for (const child of childOrders) {`;

code = code.replace(childLoopSearch, childLoopReplace);

const afterAnalyticsSearch = `            const analyticsSnapshot = executionAnalyticsService.compute(analyticsInput as any);
            (childSignal as any).executionAnalytics = analyticsSnapshot;`;

const afterAnalyticsReplace = `            const analyticsSnapshot = executionAnalyticsService.compute(analyticsInput as any);
            (childSignal as any).executionAnalytics = analyticsSnapshot;
            
            childTcaInputs.push({
                requestedSize: analyticsInput.requestedSize,
                executedSize: analyticsInput.executedSize,
                requestedPrice: analyticsInput.requestedPrice,
                executedPrice: analyticsInput.executedPrice,
                fillRatio: analyticsSnapshot.fillRatio,
                slippage: analyticsSnapshot.slippage,
                slippageBps: analyticsSnapshot.slippageBps,
                notionalExecuted: analyticsSnapshot.notionalExecuted,
                sliceIndex: child.sliceIndex,
                totalSlices: child.totalSlices
            });`;

code = code.replace(afterAnalyticsSearch, afterAnalyticsReplace);

const tryCatchSearch = `            try {
                const response = await fetch`;

const tryCatchReplace = `
            try {
                const response = await fetch`;
// Wait, I need to put the aggregator AFTER the loop finishes.
// Let's look for the end of the for loop.
