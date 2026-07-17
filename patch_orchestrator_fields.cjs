const fs = require('fs');
let code = fs.readFileSync('src/services/ExecutionOrchestrator.ts', 'utf8');

const target = "(childSignal as any).totalSlices = child.totalSlices;";
const replacement = target + "\n            (childSignal as any).executionStyle = child.executionStyle;\n            (childSignal as any).routeHint = child.routeHint;";

if (code.includes(target) && !code.includes("childSignal as any).executionStyle = child.executionStyle")) {
    code = code.replace(target, replacement);
    fs.writeFileSync('src/services/ExecutionOrchestrator.ts', code);
    console.log("Added fields to root of childSignal");
} else {
    console.log("Already added or target not found");
}
