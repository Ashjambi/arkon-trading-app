const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

const goldAndSolGates = `
  SOL_TREND: {
    hurst: 0.55,
    fisher: 1.5,
    rSquared: 0.4,
    dvol: 50,
    toxicity: 0.7,
    slippage: 0.001,
    vwapZScore: 2.0,
    ofi: 0.2,
    volRatio: 1.5,
  },
  SOL_MEAN_REV: {
    hurst: 0.4,
    fisher: 2.0,
    rSquared: 0.3,
    dvol: 40,
    toxicity: 0.5,
    slippage: 0.001,
    vwapZScore: 2.5,
    ofi: 0.1,
    volRatio: 1.2,
  },
  SOL_TREND_FOLLOWING: {
    hurst: 0.6,
    fisher: 1.0,
    rSquared: 0.5,
    dvol: 60,
    toxicity: 0.8,
    slippage: 0.001,
    vwapZScore: 1.5,
    ofi: 0.3,
    volRatio: 1.8,
  },
  SOL_CORR_ARB: {
    hurst: 0.5,
    fisher: 1.0,
    rSquared: 0.4,
    dvol: 50,
    toxicity: 0.6,
    slippage: 0.001,
    vwapZScore: 2.0,
    ofi: 0.2,
    volRatio: 1.5,
  },
  SOL_VOL_BREAK: {
    hurst: 0.6,
    fisher: 1.0,
    rSquared: 0.4,
    dvol: 70,
    toxicity: 0.9,
    slippage: 0.001,
    vwapZScore: 1.5,
    ofi: 0.4,
    volRatio: 2.0,
  },
  GOLD_TREND: {
    hurst: 0.6,
    fisher: 1.2,
    rSquared: 0.5,
    dvol: 15,
    toxicity: 0.8,
    slippage: 0.001,
    vwapZScore: 1.5,
    ofi: 0.2,
    volRatio: 1.2,
  },
  GOLD_MEAN_REV: {
    hurst: 0.4,
    fisher: 1.8,
    rSquared: 0.3,
    dvol: 10,
    toxicity: 0.6,
    slippage: 0.001,
    vwapZScore: 2.0,
    ofi: 0.1,
    volRatio: 1.1,
  },
  GOLD_TREND_FOLLOWING: {
    hurst: 0.65,
    fisher: 1.0,
    rSquared: 0.6,
    dvol: 20,
    toxicity: 0.8,
    slippage: 0.001,
    vwapZScore: 1.2,
    ofi: 0.3,
    volRatio: 1.3,
  },
  GOLD_MACRO: {
    hurst: 0.7,
    fisher: 1.0,
    rSquared: 0.6,
    dvol: 20,
    toxicity: 0.8,
    slippage: 0.001,
    vwapZScore: 1.5,
    ofi: 0.3,
    volRatio: 1.5,
  },
  GOLD_SCALPER: {
    hurst: 0.4,
    fisher: 1.5,
    rSquared: 0.2,
    dvol: 10,
    toxicity: 0.5,
    slippage: 0.001,
    vwapZScore: 2.5,
    ofi: 0.1,
    volRatio: 1.0,
  },`;

code = code.replace(
    'NEWS_SHOCK: createDefaultPerf("SCALPING"),\n    WAIT: createDefaultPerf("SWING"),\n  };',
    'NEWS_SHOCK: createDefaultPerf("SCALPING"),\n    WAIT: createDefaultPerf("SWING"),\n    SOL_TREND: createDefaultPerf("SWING"),\n    SOL_MEAN_REV: createDefaultPerf("SCALPING"),\n    SOL_TREND_FOLLOWING: createDefaultPerf("SWING"),\n    SOL_CORR_ARB: createDefaultPerf("SWING"),\n    SOL_VOL_BREAK: createDefaultPerf("SWING"),\n    GOLD_TREND: createDefaultPerf("SWING"),\n    GOLD_MEAN_REV: createDefaultPerf("SCALPING"),\n    GOLD_TREND_FOLLOWING: createDefaultPerf("SWING"),\n    GOLD_MACRO: createDefaultPerf("SWING"),\n    GOLD_SCALPER: createDefaultPerf("SCALPING"),\n  };'
);

code = code.replace(
    '  ETH_VOL_BREAK: {\n    hurst: 0.6,\n    fisher: 1.0,\n    rSquared: 0.4,\n    dvol: 70,\n    toxicity: 0.9,\n    slippage: 0.001,\n    vwapZScore: 1.5,\n    ofi: 0.4,\n    volRatio: 2.0,\n  },\n};',
    '  ETH_VOL_BREAK: {\n    hurst: 0.6,\n    fisher: 1.0,\n    rSquared: 0.4,\n    dvol: 70,\n    toxicity: 0.9,\n    slippage: 0.001,\n    vwapZScore: 1.5,\n    ofi: 0.4,\n    volRatio: 2.0,\n  },' + goldAndSolGates + '\n};'
);

fs.writeFileSync('src/App.tsx', code);
console.log("Updated Strategy Gates");
