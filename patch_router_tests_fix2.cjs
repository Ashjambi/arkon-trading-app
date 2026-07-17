const fs = require('fs');
let code = fs.readFileSync('src/services/FullPipelineMultiWinner.e2e.test.ts', 'utf8');

// I will insert tailRiskModeService.reset() at the top of these specific tests
const testsToPatch = [
    "it('Scenario: ExecutionStyleService assigns AGGRESSIVE",
    "it('Scenario: SmartOrderRouterService assigns PRIMARY",
    "it('Scenario: SmartOrderRouterService assigns SECONDARY"
];

testsToPatch.forEach(t => {
    code = code.replace(t, t + `\n        tailRiskModeService.reset();\n        smartOrderRouterService && typeof smartOrderRouterService.reset === 'function' && smartOrderRouterService.reset();`);
});

fs.writeFileSync('src/services/FullPipelineMultiWinner.e2e.test.ts', code);
console.log('Fixed');
