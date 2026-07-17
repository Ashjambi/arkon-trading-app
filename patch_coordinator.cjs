const fs = require('fs');
let content = fs.readFileSync('src/services/MultiStrategySignalCoordinatorService.ts', 'utf8');

// Add import
content = content.replace(
  "import { coordinationTraceService } from './CoordinationTraceService';",
  "import { coordinationTraceService } from './CoordinationTraceService';\nimport { executionDecisionTraceService } from './ExecutionDecisionTraceService';"
);

// Add init logic
content = content.replace(
  "coordinationTraceService.updateSnapshot(signals, overlayDecisions, arbitrationResult, finalSignals);",
  `coordinationTraceService.updateSnapshot(signals, overlayDecisions, arbitrationResult, finalSignals);
        
        if (finalSignals.length > 0) {
            executionDecisionTraceService.initTrace(finalSignals[0], true);
        } else if (signals.length > 0) {
            executionDecisionTraceService.initTrace(signals[0], true);
            executionDecisionTraceService.recordBlock('COORDINATION', 'Signal blocked by risk overlay or arbitration');
        }`
);

fs.writeFileSync('src/services/MultiStrategySignalCoordinatorService.ts', content);
