const fs = require('fs');
let code = fs.readFileSync('src/services/ExecutionOrchestrator.test.ts', 'utf8');

code = code.replace(/expect\(webhookService\.sendToWebhook\)\.toHaveBeenCalledTimes\(3\);/g, `
        console.log("webhook calls:", calls.map(c => ({ size: c[4], signalSize: c[0].size, childOrder: c[0].childOrder })));
        expect(webhookService.sendToWebhook).toHaveBeenCalledTimes(3);
`);

fs.writeFileSync('src/services/ExecutionOrchestrator.test.ts', code);
console.log('Added debug output');
