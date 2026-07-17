const fs = require('fs');
let content = fs.readFileSync('src/services/tradingAlgo.ts', 'utf8');

// Change return type
content = content.replace(
  "return { signal, analysis };",
  "return { signals, analysis, signal }; // keeping signal for backwards compatibility if needed"
);

content = content.replace(
  "let signal: TradingSignal | null = null;",
  "let signal: TradingSignal | null = null;\n  let signals: TradingSignal[] = [];"
);

content = content.replace(
  "signal = coordResult.finalSignals[0];",
  `signal = coordResult.finalSignals[0];
          signals = coordResult.finalSignals;`
);

// We need to apply the TP/SL and execution hints to all signals
content = content.replace(
  "if (signal) {\n      // تنفيذ اتفاق إدارة الصفقات:",
  `if (signals.length > 0) {
      signals.forEach(sig => {
            const profitTargetPercent = 0.02; // 2%
            const targetTp1 = sig.direction === SignalDirection.LONG 
                 ? price * (1 + profitTargetPercent) 
                 : price * (1 - profitTargetPercent);
            sig.stopLoss = 0; 
            sig.tp1 = targetTp1;
            sig.takeProfit = sig.direction === SignalDirection.LONG ? price * 1.06 : price * 0.94; 
            sig.tp2 = sig.takeProfit;
            
            if (sig.recommendedSize !== undefined) {
                const execInput = {
                    asset: sig.asset,
                    direction: sig.direction,
                    recommendedSize: sig.recommendedSize,
                    orderBookImbalance: partialState.orderBookImbalance,
                    microPrice: partialState.microPrice,
                    microPriceDeviation: partialState.microPriceDeviation,
                    topLevelImbalance: partialState.topLevelImbalance,
                    depthPressure: partialState.depthPressure,
                    normalizedOfi: partialState.normalizedOfi,
                    toxicityMetric: partialState.toxicityMetric,
                    volatilityProxy: partialState.volRatio,
                    regime: partialState.regime,
                    hunterMode: !!config.hunterMode
                };
                const execOutput = executionQualityEngine.evaluate(execInput);
                sig.executionHints = execOutput;
            }
      });
  }
  
  if (signal) {\n      // تنفيذ اتفاق إدارة الصفقات: // keep the original for signal var just in case`
);

content = content.replace(
  "// Execution Quality Layer\n      if (signal && signal.recommendedSize !== undefined) {",
  "// Execution Quality Layer\n      if (false && signal && signal.recommendedSize !== undefined) {"
);

fs.writeFileSync('src/services/tradingAlgo.ts', content);
