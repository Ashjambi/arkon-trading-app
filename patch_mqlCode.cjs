const fs = require('fs');
let code = fs.readFileSync('src/utils/mqlCode.ts', 'utf8');

const target = "    if(lotSize < 0.01) lotSize = 0.01; // FAILSAFE: minimum volume fallback";
const insertion = `
    // --- CHILD ORDER PARSING ---
    int sliceIndex = (int)ExtractJSONLong(json, "sliceIndex");
    int totalSlices = (int)ExtractJSONLong(json, "totalSlices");
    if(totalSlices <= 0) totalSlices = 1;
    string executionStyle = ExtractJSONString(json, "executionStyle");
    string routeHint = ExtractJSONString(json, "routeHint");

    if (totalSlices > 1) {
        Print("🔪 [CHILD ORDER DISPATCH] Executing Slice ", (sliceIndex + 1), "/", totalSlices, " | Style: ", executionStyle, " | Route: ", routeHint);
    }
`;

if (code.includes(target) && !code.includes("CHILD ORDER DISPATCH")) {
    code = code.replace(target, target + "\n" + insertion);
    fs.writeFileSync('src/utils/mqlCode.ts', code);
    console.log("Patched mqlCode.ts");
} else {
    console.log("mqlCode.ts already patched or target not found");
}
