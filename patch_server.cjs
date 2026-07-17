const fs = require('fs');
let content = fs.readFileSync('server.ts', 'utf8');

if (!content.includes('ExecutionDecisionTraceService')) {
    content = content.replace(
        'import { coordinationTraceService } from "./src/services/CoordinationTraceService";',
        'import { coordinationTraceService } from "./src/services/CoordinationTraceService";\nimport { executionDecisionTraceService } from "./src/services/ExecutionDecisionTraceService";'
    );
}

if (!content.includes('/api/diagnostics/execution-decision-trace')) {
    content = content.replace(
        '  app.get("/api/diagnostics/coordination-trace", (req, res) => {',
        `  app.get('/api/diagnostics/execution-decision-trace', (req, res) => {
      res.json(executionDecisionTraceService.getLatestSnapshot() || {});
  });
  
  app.get("/api/diagnostics/coordination-trace", (req, res) => {`
    );
}

fs.writeFileSync('server.ts', content);
