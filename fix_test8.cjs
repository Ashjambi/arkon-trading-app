const fs = require('fs');
let code = fs.readFileSync('src/services/ExecutionOrchestrator.test.ts', 'utf8');

code = code.replace(/const orchestrator = new ExecutionOrchestrator\(\{ \.\.\.mockConfig, maxParallelExecutions: 5 \}\);\n        orchestrator\.addLog = vi\.fn\(\);\n/g, `        const testConfig = { webhookUrl: 'http://test.com', webhookSecret: 'secret', maxAllocationPerTradePercent: 5, fixedLotSizeBTC: 1, fixedLotSizeETH: 10, forceClosePnL: -1000, strategyBudgets: {}, maxParallelExecutions: 5 } as any;\n        const orchestrator = new ExecutionOrchestrator(testConfig);\n        orchestrator.addLog = vi.fn();\n`);

fs.writeFileSync('src/services/ExecutionOrchestrator.test.ts', code);
console.log('Fixed config testConfig');
