const fs = require('fs');
let content = fs.readFileSync('src/services/ExecutionOrchestrator.test.ts', 'utf8');

content = content.replace(
  "webhookService.sendToWebhook.mockResolvedValue({ success: true, message: 'OK' });",
  "webhookService.sendToWebhook.mockResolvedValue({ success: true, message: 'OK' });\n        webhookService.sendToWebhook.mockClear();"
);

fs.writeFileSync('src/services/ExecutionOrchestrator.test.ts', content);
