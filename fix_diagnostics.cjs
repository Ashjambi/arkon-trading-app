const fs = require('fs');
const path = './src/services/DiagnosticsService.ts';
let code = fs.readFileSync(path, 'utf8');

// fix interface
code = code.replace(/counters: \{\n                preTradeBlockedTotal: 0,\n                preTradeBlockedByReason: \{\},\n    preTradeBlockedTotal: number;\n    preTradeBlockedByReason: Record<string, number>;/g, 'counters: {\n    preTradeBlockedTotal: number;\n    preTradeBlockedByReason: Record<string, number>;');

// fix constructor
code = code.replace(/counters: \{\n                signalsEvaluated: 0,/g, 'counters: {\n                preTradeBlockedTotal: 0,\n                preTradeBlockedByReason: {},\n                signalsEvaluated: 0,');

fs.writeFileSync(path, code);
