const fs = require('fs');
const path = './src/services/ExecutionOrchestrator.ts';
let code = fs.readFileSync(path, 'utf8');

if (!code.includes('isRiskReducing: isRiskReducing,')) {
    code = code.replace(
        "import { preTradeRiskGuard } from './PreTradeRiskGuard';",
        "import { preTradeRiskGuard } from './PreTradeRiskGuard';\nimport { riskLimitsService } from './RiskLimitsService';"
    );
    
    const isRiskReducingLogic = `
        const isRiskReducing = !['ENTRY', 'HEDGE', 'FLIP'].includes(actionType as string);
        const candidate = {
            symbol: signalToSend.asset || 'UNKNOWN',
            side: actionType as string,
            size: executedLotSize,
            notional: executedLotSize * (signalToSend.entry || 0),
            price: signalToSend.entry || 0,
            referencePrice: signalToSend.entry || 0,
            timestamp: Date.now(),
            isRiskReducing: isRiskReducing
        };
    `;
    code = code.replace(/        const candidate = {\n            symbol: signalToSend\.asset \|\| 'UNKNOWN',\n            side: actionType as string,\n            size: executedLotSize,\n            notional: executedLotSize \* \(signalToSend\.entry \|\| 0\),\n            price: signalToSend\.entry \|\| 0,\n            referencePrice: signalToSend\.entry \|\| 0,\n            timestamp: Date\.now\(\)\n        };/, isRiskReducingLogic.trim());
    
    // Register after execution
    const registerExecutionLogic = `
            if (result.success) {
                riskLimitsService.registerExecutedOrder(
                    signalToSend.asset || 'UNKNOWN',
                    actionType as string,
                    executedLotSize,
                    executedLotSize * (signalToSend.entry || 0),
                    isRiskReducing
                );
                this.addLog(\`🚀 تم تنفيذ: \${actionType} لـ \${signalToSend.asset || 'System'}\`, 'EXEC');
    `;
    code = code.replace(/            if \(result\.success\) {\n                this\.addLog\(`🚀 تم تنفيذ: \$\{actionType\} لـ \$\{signalToSend\.asset \|\| 'System'\}`\, 'EXEC'\);/, registerExecutionLogic.trim());
    fs.writeFileSync(path, code);
}
