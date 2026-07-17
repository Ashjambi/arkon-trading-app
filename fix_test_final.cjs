const fs = require('fs');
let code = fs.readFileSync('src/services/FullPipelineMultiWinner.e2e.test.ts', 'utf8');

code = code.replace(/call1Arg\[0\]/g, "call1Arg");
code = code.replace(/console\.log\('CALLS:', .*\);\n/g, "");
code = code.replace(/if \(\!call1Arg\)/g, "");

fs.writeFileSync('src/services/FullPipelineMultiWinner.e2e.test.ts', code);
console.log('Fixed');
