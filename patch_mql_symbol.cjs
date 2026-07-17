const fs = require('fs');
let code = fs.readFileSync('src/utils/mqlCode.ts', 'utf8');

const search1 = `    string rawSymbol = ExtractJSONString(json, "symbol");
    if(StringLen(rawSymbol) == 0) rawSymbol = ExtractJSONString(json, "original_symbol");`;

const replace1 = `    string rawAsset = ExtractJSONString(json, "asset");
    string rawSymbolExtracted = ExtractJSONString(json, "symbol");
    
    string chosenSource = "";
    string rawSymbol = "";
    
    if(StringLen(rawSymbolExtracted) > 0) {
        rawSymbol = rawSymbolExtracted;
        chosenSource = "symbol";
    } else if(StringLen(rawAsset) > 0) {
        rawSymbol = rawAsset;
        chosenSource = "asset";
    } else {
        rawSymbol = ExtractJSONString(json, "original_symbol");
        chosenSource = "fallback";
    }
    
    Print("Centralized Entry Diagnostics:");
    Print("  payload.asset = ", rawAsset);
    Print("  payload.symbol = ", rawSymbolExtracted);
    Print("  chosen execution symbol source = ", chosenSource);
    Print("  chosen execution symbol value = ", rawSymbol);`;

const search2 = `    string resolvedSymbol = ResolveSymbol(rawSymbol);
    if(!SymbolSelect(resolvedSymbol, true)) {
        Print("Centralized Entry: Failed to resolve symbol matching ", rawSymbol);
        
        // Send error callback
        string errUrl = g_WebhookURL + "/api/mt5/error";
        string errId = ExtractJSONString(json, "id");
        string errPayload = "{\\"id\\":\\"" + errId + "\\", \\"error\\":\\"BROKER_SYMBOL_NOT_RESOLVED\\", \\"message\\":\\"تعذر مطابقة الرمز الداخلي مع رمز وسيط قابل للتداول: " + rawSymbol + "\\", \\"asset\\":\\"" + rawSymbol + "\\"}";`;

const replace2 = `    string resolvedSymbol = ResolveSymbol(rawSymbol);
    
    Print("  attempted broker symbol = ", resolvedSymbol);
    
    if(!SymbolSelect(resolvedSymbol, true)) {
        Print("Centralized Entry: Failed to resolve symbol matching ", rawSymbol);
        
        // If we picked the wrong source based on a bad extracted symbol, add a note
        string errorCode = "BROKER_SYMBOL_NOT_RESOLVED";
        if(StringLen(rawAsset) > 0 && rawAsset != rawSymbol) {
             errorCode = "SYMBOL_SOURCE_MISMATCH";
        }
        
        // Send error callback
        string errUrl = g_WebhookURL + "/api/mt5/error";
        string errId = ExtractJSONString(json, "id");
        string errPayload = "{\\"id\\":\\"" + errId + "\\", \\"error\\":\\"" + errorCode + "\\", \\"message\\":\\"تعذر مطابقة الرمز الداخلي مع رمز وسيط قابل للتداول: " + rawSymbol + "\\", \\"asset\\":\\"" + rawSymbol + "\\"}";`;

if (code.includes(search1) && code.includes(search2)) {
    code = code.replace(search1, replace1);
    code = code.replace(search2, replace2);
    fs.writeFileSync('src/utils/mqlCode.ts', code);
    console.log("Patched MQL successfully");
} else {
    if (!code.includes(search1)) console.log("search1 not found");
    if (!code.includes(search2)) console.log("search2 not found");
}
