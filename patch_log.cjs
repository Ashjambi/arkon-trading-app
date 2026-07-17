const fs = require('fs');
let code = fs.readFileSync('src/services/ExecutionOrchestrator.ts', 'utf8');

code = code.replace(/const routeHint = smartOrderRouterService\.decideRoute\(routingContext as any\);/, 
  "console.log('ROUTING CONTEXT:', routingContext);\nconst routeHint = smartOrderRouterService.decideRoute(routingContext as any);");

fs.writeFileSync('src/services/ExecutionOrchestrator.ts', code);
console.log('Fixed');
