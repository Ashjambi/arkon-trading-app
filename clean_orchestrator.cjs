const fs = require('fs');
let code = fs.readFileSync('src/services/ExecutionOrchestrator.ts', 'utf8');

code = code.replace(/console\.log\('ROUTING CONTEXT:', routingContext\);\n/g, "");

fs.writeFileSync('src/services/ExecutionOrchestrator.ts', code);
console.log('Cleaned');
