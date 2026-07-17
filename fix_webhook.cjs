const fs = require('fs');
let code = fs.readFileSync('src/services/webhookService.ts', 'utf8');

const search = `      action_type: actionType, // Add action_type for new MT5 bridge to handle HEDGE/FLIP
      symbol: mappedSymbol, // Mapped symbol for MT5 (e.g., XAUUSD)`;
      
const replace = `      action_type: actionType, // Add action_type for new MT5 bridge to handle HEDGE/FLIP
      asset: mappedSymbol, // Overwrite asset for old EAs that parse 'asset' instead of 'symbol'
      symbol: mappedSymbol, // Mapped symbol for MT5 (e.g., XAUUSD)`;

if (code.includes(search)) {
    code = code.replace(search, replace);
    fs.writeFileSync('src/services/webhookService.ts', code);
    console.log("Successfully updated webhookService.ts");
} else {
    console.log("Could not find search block");
}
