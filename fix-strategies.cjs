const fs = require('fs');
const path = require('path');

const walkSync = (dir, filelist = []) => {
  fs.readdirSync(dir).forEach(file => {
    filelist = fs.statSync(path.join(dir, file)).isDirectory()
      ? walkSync(path.join(dir, file), filelist)
      : filelist.concat(path.join(dir, file));
  });
  return filelist;
};

const files = walkSync('./src/services/strategies');
const strategyTypes = {
  'BTC_MEAN_REV': 'MEAN_REV',
  'ETH_MEAN_REV': 'MEAN_REV',
  'BTC_SCALPER': 'SCALPER',
  'ETH_SCALPER': 'SCALPER',
  'BTC_OFI': 'SCALPER', 
  'BTC_AVR': 'MEAN_REV',
  'ETH_CORR_ARB': 'MEAN_REV',
  'ETH_VOL_BREAK': 'BREAKOUT',
  'VolatilityBreakout': 'BREAKOUT',
  'NewsShockStrategy': 'BREAKOUT',
  'CointegrationStrategy': 'MEAN_REV',
  'InstitutionalTrendStrategy': 'TREND'
};

files.forEach(file => {
  if (!file.endsWith('.ts') || file.includes('ScoringUtils') || file.includes('BaseStrategy') || file.includes('StrategyRegistry') || file.includes('BTC_TREND.ts') || file.includes('ETH_TREND.ts')) return;
  
  let content = fs.readFileSync(file, 'utf8');
  if (content.includes('calculateInstitutionalRisk')) return;
  
  const stratNameMatch = file.match(/\/([^\/]+)\.ts$/);
  if (!stratNameMatch) return;
  const fileName = stratNameMatch[1];
  const type = strategyTypes[fileName] || 'TREND';

  content = content.replace(/import\s+{([^}]+)}\s+from\s+"(?:..\/)+ScoringUtils";/, (match, p1) => {
    return `import { ${p1}, calculateInstitutionalRisk } from "../ScoringUtils";`;
  });
  
  content = content.replace(/import\s+{([^}]+)}\s+from\s+"\.\/ScoringUtils";/, (match, p1) => {
    return `import { ${p1}, calculateInstitutionalRisk } from "./ScoringUtils";`;
  });
  
  if (!content.includes('calculateInstitutionalRisk')) {
       content = content.replace(/import\s+{\s*BaseStrategy\s*}\s*from\s*['"]\.\/BaseStrategy['"];/, "import { BaseStrategy } from \"./BaseStrategy\";\nimport { calculateInstitutionalRisk } from \"./ScoringUtils\";");
  }

  let hasReplaced = false;
  content = content.replace(/return\s+{\s+id:(.|\n)*?qualityScore:(.|\n)*?};/m, (match) => {
      let dirMatch = match.match(/direction:\s*([^,]+),/);
      let dirStr = dirMatch ? dirMatch[1] : 'SignalDirection.LONG';
      
      const inject = `const direction = ${dirStr};
      const risk = calculateInstitutionalRisk(state, direction, '${type}');
      
      return {
${match.replace(/direction:\s*[^,]+,/, 'direction,')
       .replace(/stopLoss:\s*[^,]+,/, 'stopLoss: risk.stopLoss,')
       .replace(/takeProfit:\s*[^,]+,/, 'takeProfit: risk.takeProfit,')
       .replace(/tp1:\s*[^,]+,/, 'tp1: risk.tp1,')
       .replace(/tp2:\s*[^,]+,/, 'tp2: risk.tp2,')
       .replace(/stopLossLevel/g, 'risk.stopLoss')
       .replace(/takeProfitLevel/g, 'risk.takeProfit')
       }
`;
      hasReplaced = true;
      return inject;
  });

  if(hasReplaced) {
      content = content.replace(/const direction = direction;/g, "");
      fs.writeFileSync(file, content, 'utf8');
      console.log('Fixed', file);
  }
});
