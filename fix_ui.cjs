const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

code = code.replace(
    '                <MarketStats\n                  title="BTC/USD ALGO"\n                  state={btcAnalysis}\n                  config={config}\n                />\n                <MarketStats\n                  title="ETH/USD ALGO"\n                  state={ethAnalysis}\n                  config={config}\n                />',
    `                <MarketStats
                  title="BTC/USD ALGO"
                  state={btcAnalysis}
                  config={config}
                />
                <MarketStats
                  title="ETH/USD ALGO"
                  state={ethAnalysis}
                  config={config}
                />
                <MarketStats
                  title="SOL/USD ALGO"
                  state={solAnalysis}
                  config={config}
                />
                <MarketStats
                  title="XAU/USD ALGO"
                  state={goldAnalysis}
                  config={config}
                />`
);

fs.writeFileSync('src/App.tsx', code);
console.log("Updated UI Dashboard");
