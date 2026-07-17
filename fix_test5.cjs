const fs = require('fs');
let code = fs.readFileSync('src/services/ExecutionOrchestrator.test.ts', 'utf8');

code = code.replace(/const config = \{ webhookUrl: 'http:\/\/test\.com', webhookSecret: 'secret', maxAllocationPerTradePercent: 5, fixedLotSizeBTC: 1, fixedLotSizeETH: 10, forceClosePnL: -1000, strategyBudgets: \{\} \} as any;/g, "const config = { webhookUrl: 'http://test.com', webhookSecret: 'secret', maxAllocationPerTradePercent: 5, fixedLotSizeBTC: 1, fixedLotSizeETH: 10, forceClosePnL: -1000, strategyBudgets: {}, maxParallelExecutions: 5 } as any;\n        // Mock addLog to avoid errors\n        ExecutionOrchestrator.prototype.addLog = vi.fn();");

fs.writeFileSync('src/services/ExecutionOrchestrator.test.ts', code);
console.log('Fixed addLog');
