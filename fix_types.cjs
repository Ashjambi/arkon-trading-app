const fs = require('fs');
let code = fs.readFileSync('src/types.ts', 'utf8');
code = code.replace('fixedLotSizeETH: number;', 'fixedLotSizeETH: number;\n  fixedLotSizeSOL: number;\n  fixedLotSizeGOLD: number;');
fs.writeFileSync('src/types.ts', code);
console.log("Fixed types");
