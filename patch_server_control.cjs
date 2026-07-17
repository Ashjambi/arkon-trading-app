const fs = require('fs');
const path = './server.ts';
let code = fs.readFileSync(path, 'utf8');

if (!code.includes('/api/diagnostics/control-snapshot')) {
    const importStatement = `import { tradingControlService } from './src/services/TradingControlService';\n`;
    code = importStatement + code;

    const endpointCode = `
  app.get('/api/diagnostics/control-snapshot', (req, res) => {
      res.json(tradingControlService.getSnapshot());
  });
  
  app.post('/api/diagnostics/control/kill-switch/on', (req, res) => {
      tradingControlService.setManualKillSwitch(true);
      res.json(tradingControlService.getSnapshot());
  });
  
  app.post('/api/diagnostics/control/kill-switch/off', (req, res) => {
      tradingControlService.setManualKillSwitch(false);
      res.json(tradingControlService.getSnapshot());
  });
  
  app.post('/api/diagnostics/control/reset', (req, res) => {
      tradingControlService.reset();
      res.json(tradingControlService.getSnapshot());
  });
`;
    code = code.replace(`  app.get('/api/diagnostics/snapshot', (req, res) => {`, `${endpointCode}\n  app.get('/api/diagnostics/snapshot', (req, res) => {`);
    
    fs.writeFileSync(path, code);
}
