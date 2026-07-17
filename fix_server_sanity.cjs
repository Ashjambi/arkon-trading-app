const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

if (!code.includes('executionSanityDiagnosticService')) {
    code = code.replace(
        "import { executionDecisionTraceService } from './src/services/ExecutionDecisionTraceService';",
        "import { executionDecisionTraceService } from './src/services/ExecutionDecisionTraceService';\nimport { executionSanityDiagnosticService } from './src/services/ExecutionSanityDiagnosticService';"
    );
}

const addEndpointStr = `  app.get('/api/diagnostics/execution-sanity', (req, res) => {
    const windowHours = parseInt(req.query.hours as string) || 24;
    const report = executionSanityDiagnosticService.generateDiagnosticReport(windowHours * 60 * 60 * 1000);
    res.json(report);
  });
`;

if (!code.includes('/api/diagnostics/execution-sanity')) {
    code = code.replace(
        "app.get('/api/diagnostics/execution-decision-trace'",
        addEndpointStr + "\n  app.get('/api/diagnostics/execution-decision-trace'"
    );
}

fs.writeFileSync('server.ts', code);
