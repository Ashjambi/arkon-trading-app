const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

code = code.replace(
    'const handleGoldTicker = (data: any) => { goldDataRef.current.ticker = data; };',
    `const handleGoldTicker = (data: any) => { 
      goldDataRef.current.ticker = {
        ...data,
        last_price: parseFloat(data.c),
        instrument_name: "GOLD-PERPETUAL"
      }; 
    };`
);

code = code.replace(
    'const handleGoldBook = (data: any) => { goldDataRef.current.book = data; };',
    `const handleGoldBook = (data: any) => { 
      // map bids and asks to format expected by logic
      if (data && data.bids && data.asks) {
        goldDataRef.current.book = {
          bids: data.bids.map((b: any) => [parseFloat(b[0]), parseFloat(b[1])]),
          asks: data.asks.map((a: any) => [parseFloat(a[0]), parseFloat(a[1])])
        };
      }
    };`
);

fs.writeFileSync('src/App.tsx', code);
console.log("Updated Gold WS map");
