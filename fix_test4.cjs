const fs = require('fs');
let code = fs.readFileSync('src/services/ExecutionOrchestrator.test.ts', 'utf8');

code = code.replace(/expect\(webhookService\.sendToWebhook\)\.toHaveBeenCalledTimes\(3\);/g, "await new Promise(r => setTimeout(r, 100));\n        expect(webhookService.sendToWebhook).toHaveBeenCalledTimes(3);");

fs.writeFileSync('src/services/ExecutionOrchestrator.test.ts', code);
console.log('Fixed await webhook calls');
