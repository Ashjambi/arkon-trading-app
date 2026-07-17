const fs = require('fs');
let code = fs.readFileSync('src/utils/mqlCode.ts', 'utf8');

const search = `    string resolvedSymbol = ResolveSymbol(rawSymbol);
    if(!SymbolSelect(resolvedSymbol, true)) {
        Print("Centralized Entry: Failed to resolve symbol matching ", rawSymbol);
        return;
    }`;

const replace = `    string resolvedSymbol = ResolveSymbol(rawSymbol);
    if(!SymbolSelect(resolvedSymbol, true)) {
        Print("Centralized Entry: Failed to resolve symbol matching ", rawSymbol);
        
        // Send error callback
        string errUrl = g_WebhookURL + "/api/mt5/error";
        string errId = ExtractJSONString(json, "id");
        string errPayload = "{\\"id\\":\\"" + errId + "\\", \\"error\\":\\"BROKER_SYMBOL_NOT_RESOLVED\\", \\"message\\":\\"تعذر مطابقة الرمز الداخلي مع رمز وسيط قابل للتداول: " + rawSymbol + "\\", \\"asset\\":\\"" + rawSymbol + "\\"}";
        char errPost[], errResult[];
        StringToCharArray(errPayload, errPost, 0, WHOLE_ARRAY, CP_UTF8);
        string errHeaders = "Content-Type: application/json\\r\\nAuthorization: Bearer " + g_SecretToken + "\\r\\n";
        string errResHeaders;
        WebRequest("POST", errUrl, errHeaders, 5000, errPost, errResult, errResHeaders);
        
        return;
    }`;

if (code.includes(search)) {
    code = code.replace(search, replace);
    fs.writeFileSync('src/utils/mqlCode.ts', code);
    console.log("Patched MQL");
} else {
    console.log("Could not find search block");
}
