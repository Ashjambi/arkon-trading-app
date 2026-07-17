const fs = require('fs');
let algo = fs.readFileSync('src/services/tradingAlgo.ts', 'utf8');

algo = algo.replace(/if \(\!\(\(sig as any\)\.metadata\)\s*\(\(sig as any\)\.metadata\)\.metadata = \{\};/g, "if (!(sig as any).metadata) (sig as any).metadata = {};");
algo = algo.replace(/if \(\!\(\(sig as any\)\.metadata\) \(\(sig as any\)\.metadata = \{\};/g, "if (!(sig as any).metadata) (sig as any).metadata = {};");
algo = algo.replace(/if \(\!\(\(sig as any\)\.metadata\) \(sig as any\)\.metadata = \{\};/g, "if (!(sig as any).metadata) (sig as any).metadata = {};");

fs.writeFileSync('src/services/tradingAlgo.ts', algo);

console.log("Algo fixes applied.");
