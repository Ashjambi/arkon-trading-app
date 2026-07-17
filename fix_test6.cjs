const fs = require('fs');
let code = fs.readFileSync('src/services/ExecutionOrchestrator.test.ts', 'utf8');

code = code.replace(/ExecutionOrchestrator.prototype.addLog = vi.fn\(\);/g, "");
code = code.replace(/const config = \{ webhookUrl: 'http:\/\/test\.com', webhookSecret: 'secret', maxAllocationPerTradePercent: 5, fixedLotSizeBTC: 1, fixedLotSizeETH: 10, forceClosePnL: -1000, strategyBudgets: \{\}, maxParallelExecutions: 5 \} as any;\n/g, "");
code = code.replace(/const orchestrator = new ExecutionOrchestrator\(config\);/g, "const orchestrator = new ExecutionOrchestrator(mockConfig);\norchestrator.addLog = vi.fn();");

fs.writeFileSync('src/services/ExecutionOrchestrator.test.ts', code);
console.log('Fixed addLog again');
