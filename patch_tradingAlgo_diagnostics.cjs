const fs = require('fs');
const path = './src/services/tradingAlgo.ts';
let code = fs.readFileSync(path, 'utf8');

if (!code.includes('diagnosticsService')) {
    code = code.replace(`import { analyzeOrderFlow, MarketData } from "./orderFlowEngine";`, `import { analyzeOrderFlow, MarketData } from "./orderFlowEngine";\nimport { diagnosticsService } from "./DiagnosticsService";`);
    
    const patch1 = `
  const price = summary.last || 0;
  
  // DIAGNOSTICS: Market Data Health
  const hasOrderBook = orderBook !== null;
  const hasTradeFlow = !!(orderBook && (orderBook as any).bids && (orderBook as any).asks); // Basic check or check if recentTrades exist
  const isDegraded = orderBook === null || recentTrades.length === 0 || !!config.hunterMode;
  diagnosticsService.recordMarketDataHealth(summary.instrument_name, hasOrderBook, recentTrades.length > 0, isDegraded);
`;
    code = code.replace(`  const price = summary.last || 0;`, patch1);

    const patch2 = `
  // DIAGNOSTICS: Record Signal Evaluation
  diagnosticsService.recordSignalEvaluated(
    asset,
    strategy || 'NONE',
    direction || null,
    !!signal,
    isDegraded
  );

  return { signal, analysis };
`;
    code = code.replace(`  return { signal, analysis };`, patch2);

    fs.writeFileSync(path, code);
}
