const fs = require('fs');
let content = fs.readFileSync('src/services/ExecutionOrchestrator.test.ts', 'utf8');

content = "import * as webhookService from './webhookService';\n" + content;
content = content.replace("import * as webhookService from './webhookService';\n        ", "");

// Find and replace inside beforeEach and tests
content = content.replace(/import \* as webhookService from '\.\/webhookService';/g, "");
content = "import * as webhookService from './webhookService';\n" + content;

fs.writeFileSync('src/services/ExecutionOrchestrator.test.ts', content);
