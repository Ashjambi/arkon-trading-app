const fs = require('fs');
const path = './src/types.ts';
let code = fs.readFileSync(path, 'utf8');

if (!code.includes('executionHints')) {
    const patch = `
  recommendedSize?: number;
  executionHints?: {
      executionMode: 'NORMAL' | 'PASSIVE' | 'PRICE_IMPROVED' | 'DELAYED' | 'SKIP';
      referencePrice?: number | null;
      executionPenaltyFactor: number;
      shouldDelay: boolean;
      shouldSkip: boolean;
      reason: string;
  };
`;
    code = code.replace(`  recommendedSize?: number;`, patch);
    fs.writeFileSync(path, code);
}
