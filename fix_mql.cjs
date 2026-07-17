const fs = require('fs');
let code = fs.readFileSync('src/utils/mqlCode.ts', 'utf8');

code = code.replace(
    "    } else if(StringFind(rawSymbol, \"ETH\") >= 0) {\n        scaledLot = lotSize + (increments * 0.1);\n        Print(\"📈 Dynamic Lot Scaler [ETH]: Base Lot = \", DoubleToString(lotSize, 2), \" | Equity = $\", DoubleToString(curEquity, 2), \" | Scaled Lot = \", DoubleToString(scaledLot, 2));\n    }",
    `    } else if(StringFind(rawSymbol, "ETH") >= 0) {
        scaledLot = lotSize + (increments * 0.1);
        Print("📈 Dynamic Lot Scaler [ETH]: Base Lot = ", DoubleToString(lotSize, 2), " | Equity = $", DoubleToString(curEquity, 2), " | Scaled Lot = ", DoubleToString(scaledLot, 2));
    } else if(StringFind(rawSymbol, "SOL") >= 0) {
        scaledLot = lotSize + (increments * 1.0);
        Print("📈 Dynamic Lot Scaler [SOL]: Base Lot = ", DoubleToString(lotSize, 2), " | Equity = $", DoubleToString(curEquity, 2), " | Scaled Lot = ", DoubleToString(scaledLot, 2));
    } else if(StringFind(rawSymbol, "XAU") >= 0 || StringFind(rawSymbol, "GOLD") >= 0) {
        scaledLot = lotSize + (increments * 0.01);
        Print("📈 Dynamic Lot Scaler [GOLD]: Base Lot = ", DoubleToString(lotSize, 2), " | Equity = $", DoubleToString(curEquity, 2), " | Scaled Lot = ", DoubleToString(scaledLot, 2));
    }`
);

fs.writeFileSync('src/utils/mqlCode.ts', code);
console.log("Fixed mqlCode");
