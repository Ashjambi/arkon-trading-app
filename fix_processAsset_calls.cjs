const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

code = code.replace(
    '      await processAsset("BTC");\n      await new Promise((r) => setTimeout(r, 2000)); // 2s stagger\n      await processAsset("ETH");\n    } finally {',
    '      await processAsset("BTC");\n      await new Promise((r) => setTimeout(r, 2000)); // 2s stagger\n      await processAsset("ETH");\n      await new Promise((r) => setTimeout(r, 2000));\n      await processAsset("SOL");\n      await new Promise((r) => setTimeout(r, 2000));\n      await processAsset("GOLD");\n    } finally {'
);

fs.writeFileSync('src/App.tsx', code);
console.log("Updated processAsset calls");
