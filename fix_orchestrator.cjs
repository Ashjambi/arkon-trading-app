const fs = require('fs');
let code = fs.readFileSync('src/services/ExecutionOrchestrator.ts', 'utf8');

if (!code.includes("executionTcaAggregatorService")) {
    code = code.replace(/import \{ executionAnalyticsService \} from '\.\/ExecutionAnalyticsService';/,
    "import { executionAnalyticsService } from './ExecutionAnalyticsService';\nimport { executionTcaAggregatorService, ChildExecutionTcaInput } from './ExecutionTcaAggregatorService';");
}

code = code.replace(/let allSuccess = true;\s*for \(const child of childOrders\) \{/,
    "let allSuccess = true;\n        const childTcaInputs: ChildExecutionTcaInput[] = [];\n        for (const child of childOrders) {");

code = code.replace(/const analyticsSnapshot = executionAnalyticsService\.compute\(analyticsInput as any\);\s*\(childSignal as any\)\.executionAnalytics = analyticsSnapshot;/,
    "const analyticsSnapshot = executionAnalyticsService.compute(analyticsInput as any);\n            (childSignal as any).executionAnalytics = analyticsSnapshot;\n            childTcaInputs.push({\n                requestedSize: analyticsInput.requestedSize,\n                executedSize: analyticsInput.executedSize,\n                requestedPrice: analyticsInput.requestedPrice,\n                executedPrice: analyticsInput.executedPrice,\n                fillRatio: analyticsSnapshot.fillRatio,\n                slippage: analyticsSnapshot.slippage,\n                slippageBps: analyticsSnapshot.slippageBps,\n                notionalExecuted: analyticsSnapshot.notionalExecuted,\n                sliceIndex: child.sliceIndex,\n                totalSlices: child.totalSlices\n            });");

code = code.replace(/return \{ success: allSuccess \};/,
    "if (executionDecisionTraceService && executionDecisionTraceService.getLatestSnapshot()) {\n            const trace = executionDecisionTraceService.getLatestSnapshot();\n            if (trace && trace.executionDecision) {\n                (trace.executionDecision as any).parentTcaSummary = executionTcaAggregatorService.aggregate(childTcaInputs);\n            }\n        }\n\n        return { success: allSuccess };");

fs.writeFileSync('src/services/ExecutionOrchestrator.ts', code);
