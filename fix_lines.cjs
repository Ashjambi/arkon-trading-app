const fs = require('fs');
let code = fs.readFileSync('src/services/FullPipelineMultiWinner.e2e.test.ts', 'utf8');

code = code.replace(/it\('Scenario: ExecutionStyleService assigns AGGRESSIVE[\s\S]*?style for strong signals in low vol', async \(\) => \{/, 
  "it('Scenario: ExecutionStyleService assigns AGGRESSIVE style for strong signals in low vol', async () => {\n        tailRiskModeService.reset();\n        // reset SOR if available");

code = code.replace(/it\('Scenario: SmartOrderRouterService assigns PRIMARY[\s\S]*?route for BTC in low vol \(HIGH liquidity, AGGRESSIVE\)', async \(\) => \{/,
  "it('Scenario: SmartOrderRouterService assigns PRIMARY route for BTC in low vol (HIGH liquidity, AGGRESSIVE)', async () => {\n        tailRiskModeService.reset();");

code = code.replace(/it\('Scenario: SmartOrderRouterService assigns SECONDARY[\s\S]*?route for ALT in low vol \(MEDIUM liquidity, AGGRESSIVE\)', async \(\) => \{/,
  "it('Scenario: SmartOrderRouterService assigns SECONDARY route for ALT in low vol (MEDIUM liquidity, AGGRESSIVE)', async () => {\n        tailRiskModeService.reset();");

code = code.replace(/analysis\.qualityScore = 85; \/\/ Strong signal -> AGGRESSIVE/g, "analysis.qualityScore = 95; // Strong signal -> AGGRESSIVE");

fs.writeFileSync('src/services/FullPipelineMultiWinner.e2e.test.ts', code);
console.log('Fixed lines');
