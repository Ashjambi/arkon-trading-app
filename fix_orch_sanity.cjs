const fs = require('fs');
let code = fs.readFileSync('src/services/ExecutionOrchestrator.ts', 'utf8');

if (!code.includes('import { executionSanityDiagnosticService }')) {
    code = code.replace(
        "import { executionDecisionTraceService } from './ExecutionDecisionTraceService';",
        "import { executionDecisionTraceService } from './ExecutionDecisionTraceService';\nimport { executionSanityDiagnosticService } from './ExecutionSanityDiagnosticService';"
    );
}

const executeSignalSearch = `    public async executeSignal(signal: any, analysis: MarketAnalysisState, actionType: string = 'ENTRY', crlState: any = null): Promise<boolean> {
        // Initialize trace if it's a direct execution (bypassed coordinator) or just to be safe
        const currentTrace = executionDecisionTraceService.getLatestSnapshot();
        if (!currentTrace || !currentTrace.signal || currentTrace.signal.id !== signal.id) { 
             executionDecisionTraceService.initTrace(signal, false);
        }`;

const executeSignalReplace = `    public async executeSignal(signal: any, analysis: MarketAnalysisState, actionType: string = 'ENTRY', crlState: any = null): Promise<boolean> {
        // Initialize trace if it's a direct execution (bypassed coordinator) or just to be safe
        const currentTrace = executionDecisionTraceService.getLatestSnapshot();
        if (!currentTrace || !currentTrace.signal || currentTrace.signal.id !== signal.id) { 
             executionDecisionTraceService.initTrace(signal, false);
        }
        try {`;

const executeSignalEndSearch = `        if (executionDecisionTraceService && executionDecisionTraceService.getLatestSnapshot()) {
            const trace = executionDecisionTraceService.getLatestSnapshot();
            if (trace && trace.executionDecision) {
                (trace.executionDecision as any).parentTcaSummary = executionTcaAggregatorService.aggregate(childTcaInputs);
                (trace.executionDecision as any).timingPlanSummary = timingPlanSummary;

                // Monitor execution quality
                const monitorResult = executionQualityMonitorService.evaluate(trace.executionDecision);
                (trace.executionDecision as any).executionQualityStatus = monitorResult.executionQualityStatus;
                (trace.executionDecision as any).executionQualityAlerts = monitorResult.executionQualityAlerts;

                // Post-Trade Reporting
                const postTradeReport = postTradeExecutionReportService.generateReport(trace.executionDecision);
                (trace.executionDecision as any).postTradeExecutionReport = postTradeReport;
            }
        }
        return allSuccess;
    }`;

const executeSignalEndReplace = `        if (executionDecisionTraceService && executionDecisionTraceService.getLatestSnapshot()) {
            const trace = executionDecisionTraceService.getLatestSnapshot();
            if (trace && trace.executionDecision) {
                (trace.executionDecision as any).parentTcaSummary = executionTcaAggregatorService.aggregate(childTcaInputs);
                (trace.executionDecision as any).timingPlanSummary = timingPlanSummary;

                // Monitor execution quality
                const monitorResult = executionQualityMonitorService.evaluate(trace.executionDecision);
                (trace.executionDecision as any).executionQualityStatus = monitorResult.executionQualityStatus;
                (trace.executionDecision as any).executionQualityAlerts = monitorResult.executionQualityAlerts;

                // Post-Trade Reporting
                const postTradeReport = postTradeExecutionReportService.generateReport(trace.executionDecision);
                (trace.executionDecision as any).postTradeExecutionReport = postTradeReport;
            }
        }
        return allSuccess;
        } finally {
            executionSanityDiagnosticService.recordTrace(executionDecisionTraceService.getLatestSnapshot());
        }
    }`;

code = code.replace(executeSignalSearch, executeSignalReplace);
code = code.replace(executeSignalEndSearch, executeSignalEndReplace);

fs.writeFileSync('src/services/ExecutionOrchestrator.ts', code);
