const fs = require('fs');
let content = fs.readFileSync('src/services/ExecutionOrchestrator.test.ts', 'utf8');

content = content.replace(
  /assets: \{/g,
  "global: { maxDailyLoss: 1000 }, currentDailyPnL: 0, assets: {"
);

fs.writeFileSync('src/services/ExecutionOrchestrator.test.ts', content);
