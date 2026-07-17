const fs = require('fs');
const path = './src/services/MultiStrategySignalCoordinatorService.ts';
let code = fs.readFileSync(path, 'utf8');

// The one in step 2 should be originalSignal
// The one in step 4 should be signal
code = code.replace(
    'const signalsPassingOverlay = overlayDecisions\n            .filter(decision => !decision.suppressed)\n            .map(decision => decision.signal);',
    'const signalsPassingOverlay = overlayDecisions\n            .filter(decision => !decision.suppressed)\n            .map(decision => decision.originalSignal);'
);

code = code.replace(
    'const finalSignals = arbitrationResult.selectedSignals.map(decision => decision.originalSignal);',
    'const finalSignals = arbitrationResult.selectedSignals.map(decision => decision.signal);'
);

fs.writeFileSync(path, code);
