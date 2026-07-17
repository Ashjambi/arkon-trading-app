const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');
code = code.replace(/global\.mt5Errors/g, '(global as any).mt5Errors');
fs.writeFileSync('server.ts', code);
