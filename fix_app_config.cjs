const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

code = code.replace('fixedLotSizeETH: 0.01, // Reduced from 0.1 to prevent heavy margin usage', 'fixedLotSizeETH: 0.01,\n  fixedLotSizeSOL: 1.0,\n  fixedLotSizeGOLD: 0.01,');
code = code.replace('if (finalConfig.fixedLotSizeETH > 10.0) finalConfig.fixedLotSizeETH = 10.0;', 'if (finalConfig.fixedLotSizeETH > 10.0) finalConfig.fixedLotSizeETH = 10.0;\n        if (finalConfig.fixedLotSizeSOL > 100.0) finalConfig.fixedLotSizeSOL = 100.0;\n        if (finalConfig.fixedLotSizeGOLD > 5.0) finalConfig.fixedLotSizeGOLD = 5.0;');

fs.writeFileSync('src/App.tsx', code);
console.log("Fixed App.tsx config");
