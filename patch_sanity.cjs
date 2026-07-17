const fs = require('fs');
let code = fs.readFileSync('src/services/ExecutionSanityDiagnosticService.ts', 'utf8');

const search = `    public reset() {`;
const replace = `    public recordRejection(signalId: string, stage: string, reasonCode: string, reason: string) {
        // Find the trace
        // Note: signalId might be the child slice ID (e.g. BTC_AVR-BTC-PERPETUAL-SHORT-29737297-SLICE-0)
        // or just the parent ID. We will do a partial match.
        const trace = this.history.find(t => t.signal?.id === signalId || (t.signal && signalId.startsWith(t.signal.id)));
        if (trace && trace.executionDecision) {
            trace.executionDecision.dispatched = false;
            trace.executionDecision.attempted = true;
            trace.executionDecision.blockedStage = stage;
            trace.executionDecision.reason = reason;
            
            // Add custom pretrade decision to hold the code
            if (!trace.preTradeDecision) {
                trace.preTradeDecision = {
                    allowed: false,
                    code: reasonCode,
                    reason: reason,
                    timestamp: Date.now()
                };
            } else {
                trace.preTradeDecision.code = reasonCode;
                trace.preTradeDecision.reason = reason;
            }
        }
    }

    public reset() {`;

if (code.includes(search)) {
    code = code.replace(search, replace);
    fs.writeFileSync('src/services/ExecutionSanityDiagnosticService.ts', code);
    console.log("Patched Sanity service");
} else {
    console.log("Could not find search block");
}
