const fs = require('fs');
let code = fs.readFileSync('src/services/ExecutionOrchestrator.ts', 'utf8');

code = code.replace(
    "let baseLotSize = signalToSend.asset.includes('BTC') ? this.config.fixedLotSizeBTC : this.config.fixedLotSizeETH;",
    `let baseLotSize = this.config.fixedLotSizeETH;
        if (signalToSend.asset.includes('BTC')) baseLotSize = this.config.fixedLotSizeBTC;
        else if (signalToSend.asset.includes('SOL')) baseLotSize = this.config.fixedLotSizeSOL;
        else if (signalToSend.asset.includes('GOLD') || signalToSend.asset.includes('PAXG') || signalToSend.asset.includes('XAU')) baseLotSize = this.config.fixedLotSizeGOLD;`
);

code = code.replace(
    "            } else if (signalToSend.asset.includes('ETH')) {\n                executedLotSize = baseLotSize + (increments * 0.1);\n                this.addLog(`📈 [LOT SCALING] مضاعفة اللوت بناءً على الأرباح المحققة ($${currentProfit.toFixed(2)}): تم زيادة لوت الإيثيريوم بمقدار ${(increments * 0.1).toFixed(1)} ليصبح ${executedLotSize.toFixed(2)}\`, 'RISK');\n            }",
    `            } else if (signalToSend.asset.includes('ETH')) {
                executedLotSize = baseLotSize + (increments * 0.1);
                this.addLog(\`📈 [LOT SCALING] مضاعفة اللوت بناءً على الأرباح المحققة ($\${currentProfit.toFixed(2)}): تم زيادة لوت الإيثيريوم بمقدار \${(increments * 0.1).toFixed(1)} ليصبح \${executedLotSize.toFixed(2)}\`, 'RISK');
            } else if (signalToSend.asset.includes('SOL')) {
                executedLotSize = baseLotSize + (increments * 1.0);
                this.addLog(\`📈 [LOT SCALING] مضاعفة اللوت بناءً على الأرباح المحققة ($\${currentProfit.toFixed(2)}): تم زيادة لوت سولانا بمقدار \${(increments * 1.0).toFixed(1)} ليصبح \${executedLotSize.toFixed(2)}\`, 'RISK');
            } else if (signalToSend.asset.includes('GOLD') || signalToSend.asset.includes('PAXG') || signalToSend.asset.includes('XAU')) {
                executedLotSize = baseLotSize + (increments * 0.01);
                this.addLog(\`📈 [LOT SCALING] مضاعفة اللوت بناءً على الأرباح المحققة ($\${currentProfit.toFixed(2)}): تم زيادة لوت الذهب بمقدار \${(increments * 0.01).toFixed(2)} ليصبح \${executedLotSize.toFixed(2)}\`, 'RISK');
            }`
);

code = code.replace(
    "Fixed Lot BTC: ${this.config.fixedLotSizeBTC} ETH: ${this.config.fixedLotSizeETH}",
    "Fixed Lot BTC: ${this.config.fixedLotSizeBTC} ETH: ${this.config.fixedLotSizeETH} SOL: ${this.config.fixedLotSizeSOL} GOLD: ${this.config.fixedLotSizeGOLD}"
);

fs.writeFileSync('src/services/ExecutionOrchestrator.ts', code);
console.log("Fixed ExecutionOrchestrator");
