const fs = require('fs');
let code = fs.readFileSync('src/services/FullPipelineMultiWinner.e2e.test.ts', 'utf8');

code = code.replace(/expect\(\(call1Arg as any\)\.executionStyle\)/g, "expect((call1Arg[0] as any).executionStyle)");
code = code.replace(/expect\(\(call1Arg as any\)\.routeHint\)/g, "expect((call1Arg[0] as any).routeHint)");

fs.writeFileSync('src/services/FullPipelineMultiWinner.e2e.test.ts', code);
console.log('Fixed');
