const fs = require('fs');
const path = './src/services/ExecutionOrchestrator.ts';
let code = fs.readFileSync(path, 'utf8');

const target = `        executedLotSize = Math.max(MIN_BROKER_LOT, Number(executedLotSize.toFixed(2)));`;

const integrationCode = `
        // --- PRE-TRADE RISK GUARD ---
        const candidate = {
            symbol: signalToSend.asset || 'UNKNOWN',
            side: actionType as string,
            size: executedLotSize,
            notional: executedLotSize * (signalToSend.entry || 0),
            price: signalToSend.entry || 0,
            referencePrice: signalToSend.entry || 0,
            timestamp: Date.now()
        };
        const context = {
            lastMarketDataTs: analysis?.timestamp || Date.now()
        };
        const riskResult = preTradeRiskGuard.evaluate(candidate, context);
        if (!riskResult.allowed) {
            this.addLog(\`⛔ [PRE-TRADE BLOCKED] تم منع تنفيذ الصفقة قبل الإرسال: \${riskResult.reason}\`, 'SYSTEM');
            diagnosticsService.recordPreTradeBlocked(riskResult.decisionCode, riskResult.reason || 'Unknown');
            return false;
        }
`;

if (!code.includes('PRE-TRADE RISK GUARD')) {
    code = code.replace(target, target + '\\n' + integrationCode);
    fs.writeFileSync(path, code);
}
