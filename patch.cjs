const fs = require('fs');
let content = fs.readFileSync('server.ts', 'utf8');

// The messed up part is around:
//   app.get('/api/diagnostics/snapshot', (req, res) => {
//   });
//   });

content = content.replace(
  /  app\.get\('\/api\/diagnostics\/snapshot', \(req, res\) => \{\n  \}\);\n  \}\);/,
  `  app.get('/api/diagnostics/snapshot', (req, res) => {
      res.json(diagnosticsService.getSnapshot());
  });
  
  app.get("/api/diagnostics/coordination-trace", (req, res) => {
      res.json(coordinationTraceService.getLatestSnapshot() || {});
  });`
);
fs.writeFileSync('server.ts', content);
