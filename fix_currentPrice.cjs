const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

code = code.replace(
    '            if (perp) liveData.summary = perp;\n            console.log("REST Fallback used for", asset, "got:", perp);\n          }',
    `            if (perp) {
              liveData.summary = perp;
              currentPrice = perp.last || perp.last_price || 0;
            }
            console.log("REST Fallback used for", asset, "got:", perp);
          }`
);

fs.writeFileSync('src/App.tsx', code);
console.log("Fixed currentPrice");
