const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

code = code.replace(
    '            if (perp) liveData.summary = perp;\n          }',
    `            if (perp) liveData.summary = perp;
            console.log("REST Fallback used for", asset, "got:", perp);
          }`
);

code = code.replace(
    'addLog(\n              `DEBUG: Data fetched for ${asset}: dvol=${dvol}, optVol=${optVol}, candles=${!!candles}, dailyCandles=${!!dailyCandles}`,\n              "SYSTEM",\n            );',
    `addLog(
              \`DEBUG: Data fetched for \${asset}: price=\${perp?.last || perp?.last_price}, dvol=\${dvol}, optVol=\${optVol}, candles=\${!!candles}, dailyCandles=\${!!dailyCandles}\`,
              "SYSTEM",
            );
            console.log("ProcessAsset", asset, "Perp:", perp);
`
);

fs.writeFileSync('src/App.tsx', code);
console.log("Added logs to processAsset");
