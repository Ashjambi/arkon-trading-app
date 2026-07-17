const fs = require('fs');
let code = fs.readFileSync('src/services/ExecutionOrchestrator.ts', 'utf8');

const traceAttachmentSearch = `                (trace.executionDecision as any).executionQualityStatus = monitorResult.executionQualityStatus;
                (trace.executionDecision as any).executionQualityAlerts = monitorResult.executionQualityAlerts;`;

const traceAttachmentReplace = `                (trace.executionDecision as any).executionQualityStatus = monitorResult.executionQualityStatus;
                (trace.executionDecision as any).executionQualityAlerts = monitorResult.executionQualityAlerts;

                // Post-Trade Reporting
                const postTradeReport = postTradeExecutionReportService.generateReport(trace.executionDecision);
                (trace.executionDecision as any).postTradeExecutionReport = postTradeReport;`;

code = code.replace(traceAttachmentSearch, traceAttachmentReplace);

fs.writeFileSync('src/services/ExecutionOrchestrator.ts', code);
