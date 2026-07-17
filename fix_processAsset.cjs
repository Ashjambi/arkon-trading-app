const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

code = code.replace(
    'const processAsset = async (asset: "BTC" | "ETH") => {',
    'const processAsset = async (asset: "BTC" | "ETH" | "SOL" | "GOLD") => {'
);

code = code.replace(
    'asset === "BTC" ? btcDataRef.current : ethDataRef.current;',
    'asset === "BTC" ? btcDataRef.current : asset === "ETH" ? ethDataRef.current : asset === "SOL" ? solDataRef.current : goldDataRef.current;'
);

code = code.replace(
    'perp.instrument_name ||\n              (asset === "BTC" ? "BTC-PERPETUAL" : "ETH-PERPETUAL");',
    'perp.instrument_name ||\n              (asset === "BTC" ? "BTC-PERPETUAL" : asset === "ETH" ? "ETH-PERPETUAL" : asset === "SOL" ? "SOL-PERPETUAL" : "GOLD-PERPETUAL");'
);

code = code.replace(
    '              btcDataRef.current.summary || btcDataRef.current.ticker,\n              ethDataRef.current.summary || ethDataRef.current.ticker,',
    '              btcDataRef.current.summary || btcDataRef.current.ticker,\n              ethDataRef.current.summary || ethDataRef.current.ticker,\n              solDataRef.current.summary || solDataRef.current.ticker,\n              goldDataRef.current.summary || goldDataRef.current.ticker,'
);

code = code.replace(
    '            if (asset === "BTC") setBtcAnalysis(updateState);\n            else setEthAnalysis(updateState);',
    '            if (asset === "BTC") setBtcAnalysis(updateState);\n            else if (asset === "ETH") setEthAnalysis(updateState);\n            else if (asset === "SOL") setSolAnalysis(updateState);\n            else setGoldAnalysis(updateState);'
);

code = code.replace(
    '            if (asset === "BTC") setBtcAnalysis(updateFallbackState);\n            else setEthAnalysis(updateFallbackState);',
    '            if (asset === "BTC") setBtcAnalysis(updateFallbackState);\n            else if (asset === "ETH") setEthAnalysis(updateFallbackState);\n            else if (asset === "SOL") setSolAnalysis(updateFallbackState);\n            else setGoldAnalysis(updateFallbackState);'
);

code = code.replace(
    '                  const mappedSymbol = asset === "BTC" ? "BTCUSD" : "ETHUSD";',
    '                  const mappedSymbol = asset === "BTC" ? "BTCUSD" : asset === "ETH" ? "ETHUSD" : asset === "SOL" ? "SOLUSD" : "XAUUSD";'
);


fs.writeFileSync('src/App.tsx', code);
console.log("Updated processAsset");
