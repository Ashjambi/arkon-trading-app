const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

// Replace Deribit SOL subscriptions with Binance SOL subscriptions

code = code.replace(
    'const handleSolSummary = (data: any) => {\n      const perp = data.find((s: any) => s?.instrument_name?.includes("SOL-PERPETUAL"));\n      if (perp) solDataRef.current.summary = perp;\n    };',
    ''
);

code = code.replace(
    'const handleSolTicker = (data: any) => { solDataRef.current.ticker = data; };',
    `const handleSolTicker = (data: any) => { 
      solDataRef.current.ticker = {
        ...data,
        last_price: parseFloat(data.c),
        instrument_name: "SOL-PERPETUAL"
      }; 
    };`
);

code = code.replace(
    'const handleSolBook = (data: any) => { solDataRef.current.book = data; };',
    `const handleSolBook = (data: any) => { 
      if (data && data.bids && data.asks) {
        solDataRef.current.book = {
          bids: data.bids.map((b: any) => [parseFloat(b[0]), parseFloat(b[1])]),
          asks: data.asks.map((a: any) => [parseFloat(a[0]), parseFloat(a[1])])
        };
      }
    };`
);

code = code.replace('deribitSocket.subscribeBookSummary("SOL", "future", handleSolSummary);\n', '');
code = code.replace('deribitSocket.subscribeTicker("SOL-PERPETUAL", handleSolTicker);\n', '');
code = code.replace('deribitSocket.subscribeOrderBook("SOL-PERPETUAL", handleSolBook);\n', '');

code = code.replace(
    'binanceSocket.subscribeTicker("PAXGUSDT", handleGoldTicker);',
    `binanceSocket.subscribeTicker("SOLUSDT", handleSolTicker);
    binanceSocket.subscribeDepth("SOLUSDT", handleSolBook);
    binanceSocket.subscribeTicker("PAXGUSDT", handleGoldTicker);`
);

code = code.replace('deribitSocket.unsubscribe(`book.summary.SOL.future`, handleSolSummary);\n', '');
code = code.replace('deribitSocket.unsubscribe(`ticker.SOL-PERPETUAL.raw`, handleSolTicker);\n', '');
code = code.replace('deribitSocket.unsubscribe(\n        `book.SOL-PERPETUAL.none.10.100ms`,\n        handleSolBook,\n      );\n', '');

code = code.replace(
    'binanceSocket.unsubscribe(`ticker.PAXGUSDT`, handleGoldTicker);',
    `binanceSocket.unsubscribe(\`ticker.SOLUSDT\`, handleSolTicker);
      binanceSocket.unsubscribe(\`depth.SOLUSDT\`, handleSolBook);
      binanceSocket.unsubscribe(\`ticker.PAXGUSDT\`, handleGoldTicker);`
);

fs.writeFileSync('src/App.tsx', code);
console.log("Updated SOL to use Binance WS");
