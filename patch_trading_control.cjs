const fs = require('fs');
const path = './src/services/TradingControlService.ts';
let code = fs.readFileSync(path, 'utf8');

if (!code.includes('riskLimitsService')) {
    code = code.replace(
        "import { logStructured } from '../utils/logger';",
        "import { logStructured } from '../utils/logger';\nimport { riskLimitsService } from './RiskLimitsService';"
    );
    
    const riskCheck = `
        const riskLimits = riskLimitsService.getSnapshot();
        if (riskLimits.currentDailyPnL <= -riskLimits.global.maxDailyLoss) {
            autoBlocked = true;
            blockReason = 'Max daily loss exceeded';
        } else if (riskLimits.currentDailyPnL <= -riskLimits.global.maxDailyLoss * 0.8) {
            reducedRiskMode = true;
        } else if (riskLimits.currentOpenPositions >= riskLimits.global.maxOpenPositions) {
            reducedRiskMode = true;
        }
    `;
    
    code = code.replace(
        /        if \(this\.snapshot\.cooldownActive\) {/,
        riskCheck + "\n        if (this.snapshot.cooldownActive) {"
    );

    fs.writeFileSync(path, code);
}
