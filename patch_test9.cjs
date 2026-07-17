const fs = require('fs');
const path = './src/services/ExecutionOrchestrator.test.ts';
let code = fs.readFileSync(path, 'utf8');

code = code.replace(
    /        const signal = {\n            asset: 'BTC-PERPETUAL',\n            direction: 'LONG',\n            entry: 50000,\n            strategy: 'BTC_SCALPER'\n        };/,
    `        const signal = {\n            asset: 'BTC-PERPETUAL',\n            direction: 'LONG',\n            entry: 5000,\n            strategy: 'BTC_SCALPER'\n        };`
);

fs.writeFileSync(path, code);
