const fs = require('fs');
const path = './src/services/PreTradeRiskGuard.ts';
let code = fs.readFileSync(path, 'utf8');

if (!code.includes('isRiskReducing?')) {
    code = code.replace(
        "import { tradingControlService } from './TradingControlService';",
        "import { tradingControlService } from './TradingControlService';\nimport { riskLimitsService } from './RiskLimitsService';"
    );
    
    code = code.replace(
        /    timestamp: number;\n}/,
        "    timestamp: number;\n    isRiskReducing?: boolean;\n}"
    );
    
    code = code.replace(
        /    \| 'BLOCKED_CONTROL_LAYER'/,
        "    | 'BLOCKED_CONTROL_LAYER'\n    | 'BLOCKED_EXPOSURE'"
    );
    
    const riskLimitsCheck = `
        // Exposure Limits Check (Only for ENTRY orders)
        if (!candidate.isRiskReducing) {
            const limitsResult = riskLimitsService.isEntryAllowed(candidate.symbol, candidate.notional, candidate.size);
            if (!limitsResult.allowed) {
                return this.reject('BLOCKED_EXPOSURE', limitsResult.reason || 'Exposure limit breached');
            }
        }
    `;
    code = code.replace(
        "// Allowed",
        riskLimitsCheck + "\n        // Allowed"
    );

    fs.writeFileSync(path, code);
}
