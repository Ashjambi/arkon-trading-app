const fs = require('fs');
let code = fs.readFileSync('src/services/ExecutionOrchestrator.test.ts', 'utf8');

code = code.replace(/await new Promise\(r => setTimeout\(r, 100\)\);/g, `
        await new Promise(r => setTimeout(r, 100));
        // Reset webhook calls if they carried over
        // webhookService.sendToWebhook.mockClear(); 
`);

fs.writeFileSync('src/services/ExecutionOrchestrator.test.ts', code);
