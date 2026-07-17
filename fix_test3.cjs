const fs = require('fs');
let code = fs.readFileSync('src/services/ExecutionOrchestrator.test.ts', 'utf8');

code = code.replace(/const analysis = \{ qualityScore: 95, timestamp: Date\.now\(\), regime: 'LOW_VOLATILITY' \};/g, "const analysis = { qualityScore: 95, timestamp: Date.now(), regime: 'LOW_VOLATILITY', mtfStatus: { dailyTrend: 'UP', h4Trend: 'UP' } };");

fs.writeFileSync('src/services/ExecutionOrchestrator.test.ts', code);
console.log('Fixed mtfStatus');
