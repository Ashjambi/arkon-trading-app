const fs = require('fs');
let code = fs.readFileSync('src/services/ExecutionOrchestrator.ts', 'utf8');

const search = `        if (!currentTrace || !currentTrace.signal || currentTrace.signal.id !== signal.id) { 
             executionDecisionTraceService.initTrace(signal, false);
        }`;

const replace = `        if (!currentTrace || !currentTrace.signal || currentTrace.signal.id !== signal.id) { 
             executionDecisionTraceService.initTrace(signal, false);
        }
        try {`;

code = code.replace(search, replace);
fs.writeFileSync('src/services/ExecutionOrchestrator.ts', code);
