const fs = require('fs');
let code = fs.readFileSync('src/services/ExecutionOrchestrator.test.ts', 'utf8');

code = code.replace(/const orchestrator = new ExecutionOrchestrator\(mockConfig\);/g, "const config = { webhookUrl: 'http://test.com', webhookSecret: 'secret', maxAllocationPerTradePercent: 5, fixedLotSizeBTC: 1, fixedLotSizeETH: 10, forceClosePnL: -1000, strategyBudgets: {} } as any;\n        const orchestrator = new ExecutionOrchestrator(config);");

fs.writeFileSync('src/services/ExecutionOrchestrator.test.ts', code);
console.log('Fixed config');
