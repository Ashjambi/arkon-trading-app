const fs = require('fs');
let content = fs.readFileSync('src/App.tsx', 'utf8');

content = content.replace(
  "const success = await executionOrchestrator.executeSignal(\n          originalSignal,\n          analysis,\n          actionType,\n          crlState\n        );",
  `const success = await executionOrchestrator.executePlan(
          signalsToProcess,
          analysis,
          actionType,
          crlState
        );`
);

fs.writeFileSync('src/App.tsx', content);
