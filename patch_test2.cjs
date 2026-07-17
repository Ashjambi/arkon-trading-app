const fs = require('fs');
let content = fs.readFileSync('src/services/ExecutionOrchestrator.test.ts', 'utf8');

const emptyAnalysis = "{} as any";
const validAnalysis = "{ mtfStatus: { dailyTrend: 'UP', h4Regime: 'TREND', m15Trigger: true } } as any";

content = content.replace(/\{\} as any/g, validAnalysis);

fs.writeFileSync('src/services/ExecutionOrchestrator.test.ts', content);
