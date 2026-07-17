const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const search = `    if (!req.url.includes('/mt5/signals') && !req.url.includes('/bridge/status') && !req.url.includes('/last-raw-requests') && !req.url.includes('/bridge/managed-trades')) {`;
const replace = `    if (!req.url.includes('/mt5/signals') && !req.url.includes('/bridge/status') && !req.url.includes('/last-raw-requests') && !req.url.includes('/bridge/managed-trades') && !req.url.includes('/mt5/errors')) {`;

if (code.includes(search)) {
    code = code.replace(search, replace);
    fs.writeFileSync('server.ts', code);
    console.log("Patched logger");
} else {
    console.log("Could not find search block");
}
