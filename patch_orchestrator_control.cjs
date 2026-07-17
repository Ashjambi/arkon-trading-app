const fs = require('fs');
const path = './src/services/ExecutionOrchestrator.ts';
let code = fs.readFileSync(path, 'utf8');

if (!code.includes('tradingControlService')) {
    code = `import { tradingControlService } from './TradingControlService';\n` + code;
    
    const controlCheckLogic = `
        // Check Runtime Trading Control Layer
        const controlMode = tradingControlService.evaluateControlState();
        if (controlMode === 'BLOCKED') {
            const blockReason = tradingControlService.getSnapshot().lastBlockReason || 'Unknown';
            this.addLog(\`⛔ [CONTROL BLOCKED] تم منع تنفيذ الصفقة بواسطة نظام الحماية: \${blockReason}\`, 'SYSTEM');
            return false;
        }

`;
    code = code.replace(`        this.addLog(\`🚀 [EXECUTION START] تمرير الإشارة للميتاتريدر | Action: \${actionType}\`, 'EXEC');`, `        this.addLog(\`🚀 [EXECUTION START] تمرير الإشارة للميتاتريدر | Action: \${actionType}\`, 'EXEC');\n${controlCheckLogic}`);
    
    const controlFeedbackLogic = `
            if (hints.shouldSkip) {
                tradingControlService.recordExecutionSkip();
                this.addLog(\`⛔ [EXECUTION SKIP] تم تجاهل الإشارة بسبب ظروف التنفيذ: \${hints.reason}\`, 'EXEC');
                return false;
            }
            if (hints.shouldDelay) {
                tradingControlService.recordExecutionDelay();
                this.addLog(\`⚠️ [EXECUTION DELAYED] إشارة تأخير (تنفيذ فوري مخفف): \${hints.reason}\`, 'EXEC');
            } else if (!hints.shouldSkip) {
                tradingControlService.recordNormalExecution();
            }
        } else {
            tradingControlService.recordNormalExecution();
        }
`;
    // We need to replace the hints processing logic
    code = code.replace(`
            if (hints.shouldSkip) {
                this.addLog(\`⛔ [EXECUTION SKIP] تم تجاهل الإشارة بسبب ظروف التنفيذ: \${hints.reason}\`, 'EXEC');
                return false;
            }
            if (hints.shouldDelay) {
                this.addLog(\`⚠️ [EXECUTION DELAYED] إشارة تأخير (تنفيذ فوري مخفف): \${hints.reason}\`, 'EXEC');
            }
        }`, controlFeedbackLogic);
        
    const reducedRiskLogic = `
        let executedLotSize = signalToSend.recommendedSize || (this.config.autoExecution ? 
            (signalToSend.asset.startsWith('BTC') ? this.config.fixedLotSizeBTC : this.config.fixedLotSizeETH) : 0);
            
        // Apply Trading Control reduced risk mode penalty
        if (controlMode === 'REDUCED') {
            executedLotSize = executedLotSize * 0.5;
            this.addLog(\`📉 تقليص إضافي لحجم العقد (50%) بسبب تفعيل نظام الحماية (Reduced Risk Mode)\`, 'RISK');
        }
`;
    // We need to find `let executedLotSize` and replace it
    code = code.replace(`        let executedLotSize = signalToSend.recommendedSize || (this.config.autoExecution ? \n            (signalToSend.asset.startsWith('BTC') ? this.config.fixedLotSizeBTC : this.config.fixedLotSizeETH) : 0);`, reducedRiskLogic);
    
    fs.writeFileSync(path, code);
}
