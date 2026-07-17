const fs = require('fs');
const path = './src/services/ExecutionOrchestrator.ts';
let code = fs.readFileSync(path, 'utf8');

if (!code.includes('diagnosticsService')) {
    code = `import { diagnosticsService } from './DiagnosticsService';\n` + code;
    
    const execHintsLogic = `
        // Check Execution Quality Hints
        if (signal.executionHints) {
            const hints = signal.executionHints;
            
            // Record execution quality
            diagnosticsService.recordExecutionQuality(
                hints.executionMode, 
                signal.recommendedSize || 0
            );

`;
    code = code.replace(`        // Check Execution Quality Hints\n        if (signal.executionHints) {\n            const hints = signal.executionHints;`, execHintsLogic);
    
    fs.writeFileSync(path, code);
}
