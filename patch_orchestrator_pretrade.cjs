const fs = require('fs');
const path = './src/services/ExecutionOrchestrator.ts';
let code = fs.readFileSync(path, 'utf8');

if (!code.includes('preTradeRiskGuard')) {
    code = `import { preTradeRiskGuard } from './PreTradeRiskGuard';\n` + code;
    
    // We want to insert the check before: `// --- ANTI-MARGIN CALL / BROKER MIN LOT ENFORCEMENT ---`
    // Let's see what's after `this.addLog(\`📉 تقليص إضافي لحجم العقد (50%) بسبب تفعيل نظام الحماية (Reduced Risk Mode)\`, 'RISK');\n        }`
    
    // Check if `// --- ANTI-MARGIN CALL` is present, or just append it right after the reduced lot size logic
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
    
    code = code.replace(`// Send to webhook`, `${integrationCode}        // Send to webhook`);
    fs.writeFileSync(path, code);
}
