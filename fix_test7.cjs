const fs = require('fs');
let code = fs.readFileSync('src/services/ExecutionOrchestrator.test.ts', 'utf8');

code = code.replace(/const orchestrator = new ExecutionOrchestrator\(mockConfig\);\norchestrator\.addLog = vi\.fn\(\);/g, `        const orchestrator = new ExecutionOrchestrator({ ...mockConfig, maxParallelExecutions: 5 });\n        orchestrator.addLog = vi.fn();\n`);

fs.writeFileSync('src/services/ExecutionOrchestrator.test.ts', code);
console.log('Fixed config again');
