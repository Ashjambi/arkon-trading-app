const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

code = code.replace(
    '    const handleGoldTicker = (data: any) => {};\n    const handleGoldBook = (data: any) => {};',
    `    const handleSolSummary = (data: any) => {
      const perp = data.find((s: any) => s?.instrument_name?.includes("SOL-PERPETUAL"));
      if (perp) solDataRef.current.summary = perp;
    };
    const handleSolTicker = (data: any) => { solDataRef.current.ticker = data; };
    const handleSolBook = (data: any) => { solDataRef.current.book = data; };

    const handleGoldTicker = (data: any) => { goldDataRef.current.ticker = data; };
    const handleGoldBook = (data: any) => { goldDataRef.current.book = data; };`
);

code = code.replace(
    '    deribitSocket.subscribeBookSummary("ETH", "future", handleEthSummary);\n    deribitSocket.subscribeTicker("BTC-PERPETUAL", handleBtcTicker);\n    deribitSocket.subscribeTicker("ETH-PERPETUAL", handleEthTicker);\n    deribitSocket.subscribeOrderBook("BTC-PERPETUAL", handleBtcBook);\n    deribitSocket.subscribeOrderBook("ETH-PERPETUAL", handleEthBook);',
    `    deribitSocket.subscribeBookSummary("ETH", "future", handleEthSummary);
    deribitSocket.subscribeBookSummary("SOL", "future", handleSolSummary);
    deribitSocket.subscribeTicker("BTC-PERPETUAL", handleBtcTicker);
    deribitSocket.subscribeTicker("ETH-PERPETUAL", handleEthTicker);
    deribitSocket.subscribeTicker("SOL-PERPETUAL", handleSolTicker);
    deribitSocket.subscribeOrderBook("BTC-PERPETUAL", handleBtcBook);
    deribitSocket.subscribeOrderBook("ETH-PERPETUAL", handleEthBook);
    deribitSocket.subscribeOrderBook("SOL-PERPETUAL", handleSolBook);`
);

code = code.replace(
    '      deribitSocket.unsubscribe(`book.summary.ETH.future`, handleEthSummary);\n      deribitSocket.unsubscribe(`ticker.BTC-PERPETUAL.raw`, handleBtcTicker);\n      deribitSocket.unsubscribe(`ticker.ETH-PERPETUAL.raw`, handleEthTicker);\n      deribitSocket.unsubscribe(\n        `book.BTC-PERPETUAL.none.10.100ms`,\n        handleBtcBook,\n      );\n      deribitSocket.unsubscribe(\n        `book.ETH-PERPETUAL.none.10.100ms`,\n        handleEthBook,\n      );',
    `      deribitSocket.unsubscribe(\`book.summary.ETH.future\`, handleEthSummary);
      deribitSocket.unsubscribe(\`book.summary.SOL.future\`, handleSolSummary);
      deribitSocket.unsubscribe(\`ticker.BTC-PERPETUAL.raw\`, handleBtcTicker);
      deribitSocket.unsubscribe(\`ticker.ETH-PERPETUAL.raw\`, handleEthTicker);
      deribitSocket.unsubscribe(\`ticker.SOL-PERPETUAL.raw\`, handleSolTicker);
      deribitSocket.unsubscribe(
        \`book.BTC-PERPETUAL.none.10.100ms\`,
        handleBtcBook,
      );
      deribitSocket.unsubscribe(
        \`book.ETH-PERPETUAL.none.10.100ms\`,
        handleEthBook,
      );
      deribitSocket.unsubscribe(
        \`book.SOL-PERPETUAL.none.10.100ms\`,
        handleSolBook,
      );`
);

fs.writeFileSync('src/App.tsx', code);
console.log("Updated WS Handlers");
