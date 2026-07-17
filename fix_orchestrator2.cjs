const fs = require('fs');
let code = fs.readFileSync('src/services/ExecutionOrchestrator.ts', 'utf8');

code = code.replace(/return allSuccess;/, 
`if (executionDecisionTraceService && executionDecisionTraceService.getLatestSnapshot()) {
            const trace = executionDecisionTraceService.getLatestSnapshot();
            if (trace && trace.executionDecision) {
                (trace.executionDecision as any).parentTcaSummary = executionTcaAggregatorService.aggregate(childTcaInputs);
            }
        }
        return allSuccess;`);

fs.writeFileSync('src/services/ExecutionOrchestrator.ts', code);
