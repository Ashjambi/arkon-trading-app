const fs = require('fs');
let code = fs.readFileSync('src/services/FullPipelineMultiWinner.e2e.test.ts', 'utf8');

code = code.replace(/if \(\!call1Arg\)/g, "console.log('CALLS:', vi.mocked(webhookService.sendToWebhook).mock.calls.map(c => c[0].id));\nif (!call1Arg)");

fs.writeFileSync('src/services/FullPipelineMultiWinner.e2e.test.ts', code);
console.log('Fixed');
