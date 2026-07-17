const fs = require('fs');
let code = fs.readFileSync('src/services/ExecutionOrchestrator.ts', 'utf8');

const traceAttachmentSearch = `(trace.executionDecision as any).timingPlanSummary = timingPlanSummary;`;

const traceAttachmentReplace = `(trace.executionDecision as any).timingPlanSummary = timingPlanSummary;

                // Monitor execution quality
                const monitorResult = executionQualityMonitorService.evaluate(trace.executionDecision);
                (trace.executionDecision as any).executionQualityStatus = monitorResult.executionQualityStatus;
                (trace.executionDecision as any).executionQualityAlerts = monitorResult.executionQualityAlerts;`;

code = code.replace(traceAttachmentSearch, traceAttachmentReplace);

fs.writeFileSync('src/services/ExecutionOrchestrator.ts', code);
