const fs = require('fs');
let code = fs.readFileSync('src/services/webhookService.ts', 'utf8');

const search = `    const payload = {
      ...signal,
      action: actionType,`;
const replace = `    // Clean up nested objects that confuse MT5 JSON parser
    const cleanSignal = { ...signal };
    delete cleanSignal.childOrder;
    delete cleanSignal.executionAnalytics;
    delete cleanSignal.reasoning; // optional, saves bandwidth

    const payload = {
      ...cleanSignal,
      action: actionType,`;

if (code.includes(search)) {
    code = code.replace(search, replace);
    fs.writeFileSync('src/services/webhookService.ts', code);
    console.log("Patched webhookService payload");
} else {
    console.log("Could not find search block");
}
