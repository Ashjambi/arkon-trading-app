const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');
code = code.replace(/server: \{ middlewareMode: true \},/g, "server: { middlewareMode: true, hmr: false },");
fs.writeFileSync('server.ts', code);
console.log("Fixed HMR");
