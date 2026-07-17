const fs = require('fs');
const path = './server.ts';
let code = fs.readFileSync(path, 'utf8');

if (!code.includes('/api/diagnostics/pretrade-snapshot')) {
    const importStatement = `import { preTradeRiskGuard } from './src/services/PreTradeRiskGuard';\n`;
    code = importStatement + code;

    const endpointCode = `
  app.get('/api/diagnostics/pretrade-snapshot', (req, res) => {
      res.json(preTradeRiskGuard.getSnapshot());
  });
`;
    code = code.replace(`  app.get('/api/diagnostics/control-snapshot'`, `${endpointCode}\n  app.get('/api/diagnostics/control-snapshot'`);
    
    fs.writeFileSync(path, code);
}
