const fs = require('fs');
let code = fs.readFileSync('src/services/webhookService.ts', 'utf8');

const search = `    // Clean up nested objects that confuse MT5 JSON parser
    const cleanSignal = { ...signal };
    delete cleanSignal.childOrder;
    delete cleanSignal.executionAnalytics;
    delete cleanSignal.reasoning; // optional, saves bandwidth

    const payload = {
      action: actionType,
      action_type: actionType, // Add action_type for new MT5 bridge to handle HEDGE/FLIP
      asset: mappedSymbol, // Overwrite asset for old EAs that parse 'asset' instead of 'symbol'
      symbol: mappedSymbol, // Mapped symbol for MT5 (e.g., XAUUSD)
      original_symbol: baseSymbol,
      maxAllocation,
      fixedLotSize: fixedLotSize,
      lotMultiplier: signal.lotMultiplier || 1.0,
      forceClosePnL,
      secret: secret, // Add secret to payload for bridge validation
      ...cleanSignal,
    };`;

const replace = `    // Clean up nested objects that confuse MT5 JSON parser
    const cleanSignal = { ...signal };
    delete cleanSignal.childOrder;
    delete cleanSignal.executionAnalytics;
    delete cleanSignal.reasoning; // optional, saves bandwidth
    
    // Explicitly remove keys we are going to override so their insertion order is reset to the top
    delete cleanSignal.asset;
    delete cleanSignal.symbol;
    delete cleanSignal.original_symbol;

    const payload = {
      asset: mappedSymbol, // Overwrite asset for old EAs that parse 'asset' instead of 'symbol'
      symbol: mappedSymbol, // Mapped symbol for MT5 (e.g., XAUUSD)
      original_symbol: baseSymbol,
      action: actionType,
      action_type: actionType, // Add action_type for new MT5 bridge to handle HEDGE/FLIP
      maxAllocation,
      fixedLotSize: fixedLotSize,
      lotMultiplier: signal.lotMultiplier || 1.0,
      forceClosePnL,
      secret: secret, // Add secret to payload for bridge validation
      ...cleanSignal,
    };`;

if (code.includes(search)) {
    code = code.replace(search, replace);
    fs.writeFileSync('src/services/webhookService.ts', code);
    console.log("Patched webhookService order correctly");
} else {
    console.log("Could not find search block");
}
