const fs = require('fs');
let code = fs.readFileSync('src/services/ExecutionOrchestrator.ts', 'utf8');

if (!code.includes('import { executionQualityMonitorService }')) {
    code = code.replace(
        "import { childOrderTimingOverlayService } from './ChildOrderTimingOverlayService';",
        "import { childOrderTimingOverlayService } from './ChildOrderTimingOverlayService';\nimport { executionQualityMonitorService } from './ExecutionQualityMonitorService';"
    );
}

const traceAttachmentSearch = `                (trace.executionDecision as any).parentTcaSummary = executionTcaAggregatorService.aggregate(childTcaInputs);
                (trace.executionDecision as any).timingPlanSummary = timingPlanSummary;
            }
        }

        return allSuccess;`;

const traceAttachmentReplace = `                (trace.executionDecision as any).parentTcaSummary = executionTcaAggregatorService.aggregate(childTcaInputs);
                (trace.executionDecision as any).timingPlanSummary = timingPlanSummary;

                // Monitor execution quality
                const monitorResult = executionQualityMonitorService.evaluate(trace.executionDecision);
                (trace.executionDecision as any).executionQualityStatus = monitorResult.executionQualityStatus;
                (trace.executionDecision as any).executionQualityAlerts = monitorResult.executionQualityAlerts;
            }
        }

        return allSuccess;`;

code = code.replace(traceAttachmentSearch, traceAttachmentReplace);

fs.writeFileSync('src/services/ExecutionOrchestrator.ts', code);
