const fs = require('fs');
let content = fs.readFileSync('src/App.tsx', 'utf8');

// Change `const { signal: rawSignal, analysis } = generateSignal(`
content = content.replace(
  "const { signal: rawSignal, analysis } = generateSignal(",
  "const { signals: rawSignals, signal: rawSignal, analysis } = generateSignal("
);

content = content.replace(
  "let signal = rawSignal;\n\n            if (signal) {",
  `let signal = rawSignal;
            let signalsToProcess = rawSignals && rawSignals.length > 0 ? rawSignals : (signal ? [signal] : []);
            
            if (signalsToProcess.length > 0) {
              signalsToProcess.forEach((s, idx) => {
                  const currentMinute = Math.floor(Date.now() / 60000);
                  const stratAssetId = \`\${s.strategy}-\${s.asset}\`;
                  s.id = \`\${stratAssetId}-\${s.direction}-\${currentMinute}-\${idx}\`;
              });
            }
            if (signal) {`
);

// We need to change executionOrchestrator.executeSignal(originalSignal... to loop or change executionOrchestrator to executePlan
fs.writeFileSync('src/App.tsx', content);
