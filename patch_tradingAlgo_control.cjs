const fs = require('fs');
const path = './src/services/tradingAlgo.ts';
let code = fs.readFileSync(path, 'utf8');

if (!code.includes('tradingControlService')) {
    code = code.replace(`import { diagnosticsService } from "./DiagnosticsService";`, `import { diagnosticsService } from "./DiagnosticsService";\nimport { tradingControlService } from "./TradingControlService";`);
    
    // In tradingAlgo, we have this block:
    // const hasOrderBook = orderBook !== null;
    // const hasTradeFlow = !!(orderBook && (orderBook as any).bids && (orderBook as any).asks);
    // const isDegraded = orderBook === null || recentTrades.length === 0 || !!config.hunterMode;
    // We can use isDegraded to trigger recordDegradedData()
    const patch1 = `
  const isDegraded = orderBook === null || recentTrades.length === 0 || !!config.hunterMode;
  diagnosticsService.recordMarketDataHealth(summary.instrument_name, hasOrderBook, recentTrades.length > 0, isDegraded);
  
  if (isDegraded && !config.hunterMode) {
      tradingControlService.recordDegradedData();
  }
`;
    code = code.replace(`  const isDegraded = orderBook === null || recentTrades.length === 0 || !!config.hunterMode;\n  diagnosticsService.recordMarketDataHealth(summary.instrument_name, hasOrderBook, recentTrades.length > 0, isDegraded);`, patch1);
    
    fs.writeFileSync(path, code);
}
