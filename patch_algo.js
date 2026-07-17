const fs = require('fs');

const path = 'src/services/tradingAlgo.ts';
let content = fs.readFileSync(path, 'utf8');

if (!content.includes('import { multiStrategySignalCoordinatorService }')) {
    content = content.replace(
        "import { diagnosticsService } from \"./DiagnosticsService\";",
        "import { diagnosticsService } from \"./DiagnosticsService\";\nimport { multiStrategySignalCoordinatorService } from \"./MultiStrategySignalCoordinatorService\";"
    );
}

// Add candidate array
content = content.replace(
    "let signal: TradingSignal | null = null;",
    "let signal: TradingSignal | null = null;\n  const candidateSignals: TradingSignal[] = [];"
);

// Replace loop break logic
const oldBlock = `      if (sig && validation.score >= executionThreshold) {
          signal = sig;
          strategy = strategyType;
          direction = sig.direction;
          reasoning = \`\${config.hunterMode ? 'HUNTER SCALP' : rankedStrat.reason} | \${sig.reasoning}\`;
          qualityScore = validation.score;
          primaryBlocker = validation.passed ? "ALPHA LOCKED 🎯" : config.hunterMode ? "HUNTER EXECUTED 🐺" : "ALPHA OVERRIDE ⚡";
          logStructured('QUANT', 'INFO', 'signal_accepted', \`[\${asset}] [Strategy: \${strategyType}] SELECTED as final signal (Score: \${qualityScore}, Config Threshold: \${executionThreshold}, Hunter: \${config.hunterMode})\`, {
            asset,
            strategy: strategyType,
            score: qualityScore,
            threshold: executionThreshold,
            hunterMode: config.hunterMode
          });
          break; // Found the best valid signal, stop searching
      } else if (sig) {`;

const newBlock = `      if (sig && validation.score >= executionThreshold) {
          sig.qualityScore = validation.score;
          sig.reasoning = \`\${config.hunterMode ? 'HUNTER SCALP' : rankedStrat.reason} | \${sig.reasoning}\`;
          candidateSignals.push(sig);
          
          logStructured('QUANT', 'INFO', 'signal_candidate', \`[\${asset}] [Strategy: \${strategyType}] CANDIDATE signal generated (Score: \${validation.score}, Config Threshold: \${executionThreshold}, Hunter: \${config.hunterMode})\`, {
            asset,
            strategy: strategyType,
            score: validation.score,
            threshold: executionThreshold,
            hunterMode: config.hunterMode
          });
      } else if (sig) {`;

content = content.replace(oldBlock, newBlock);

// Insert coordination logic after loop
const afterLoop = `  }

  if (!signal) {
      qualityScore = maxValidationScore;
  }`;

const coordLogic = `  }

  if (candidateSignals.length > 0) {
      const coordResult = multiStrategySignalCoordinatorService.coordinate(candidateSignals);
      if (coordResult.finalSignals.length > 0) {
          signal = coordResult.finalSignals[0];
          strategy = signal.strategy as StrategyType;
          direction = signal.direction;
          reasoning = signal.reasoning || "";
          qualityScore = signal.qualityScore || 0;
          primaryBlocker = "ALPHA LOCKED 🎯";
          
          logStructured('QUANT', 'INFO', 'signal_accepted', \`[\${asset}] [Strategy: \${strategy}] SELECTED as final coordinated signal (Score: \${qualityScore})\`, {
            asset,
            strategy,
            score: qualityScore
          });
      }
  }

  if (!signal) {
      qualityScore = maxValidationScore;
  }`;

content = content.replace(afterLoop, coordLogic);

fs.writeFileSync(path, content);
console.log("Patched tradingAlgo.ts");
