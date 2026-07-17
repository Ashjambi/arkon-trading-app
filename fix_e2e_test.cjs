const fs = require('fs');
let code = fs.readFileSync('src/services/FullPipelineMultiWinner.e2e.test.ts', 'utf8');

code = code.replace(/expect\(\(call1Arg as any\).childOrders\).toBeDefined\(\);/g, "expect((call1Arg as any).childOrder).toBeDefined();");
code = code.replace(/expect\(Array.isArray\(\(call1Arg as any\).childOrders\)\).toBe\(true\);/g, "expect(typeof (call1Arg as any).childOrder === 'object').toBe(true);");
code = code.replace(/expect\(\(call1Arg as any\).childOrders.length\).toBeGreaterThan\(0\);/g, "expect((call1Arg as any).childOrder.sliceIndex).toBeGreaterThanOrEqual(0);");

fs.writeFileSync('src/services/FullPipelineMultiWinner.e2e.test.ts', code);
console.log('Fixed e2e test property names');
