const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

code = code.replace(
    'const currentPrice = perp ? perp.last || perp.last_price : 0;',
    'let currentPrice = perp ? perp.last || perp.last_price : 0;'
);

fs.writeFileSync('src/App.tsx', code);
console.log("Fixed currentPrice let");
