const fs = require('fs');
let code = fs.readFileSync('src/types.ts', 'utf8');

code = code.replace(
    "'ETH_TREND' | 'ETH_MEAN_REV' | 'ETH_TREND_FOLLOWING' | 'ETH_CORR_ARB' | 'ETH_VOL_BREAK' | 'ETH_SCALPER' |",
    "'ETH_TREND' | 'ETH_MEAN_REV' | 'ETH_TREND_FOLLOWING' | 'ETH_CORR_ARB' | 'ETH_VOL_BREAK' | 'ETH_SCALPER' |\n    'SOL_TREND' | 'SOL_MEAN_REV' | 'SOL_TREND_FOLLOWING' | 'SOL_CORR_ARB' | 'SOL_VOL_BREAK' |\n    'GOLD_TREND' | 'GOLD_MEAN_REV' | 'GOLD_TREND_FOLLOWING' | 'GOLD_MACRO' | 'GOLD_SCALPER' |"
);

fs.writeFileSync('src/types.ts', code);
console.log("Updated StrategyType");
