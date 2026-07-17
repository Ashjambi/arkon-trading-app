const fs = require('fs');
const path = './src/services/DiagnosticsService.ts';
let code = fs.readFileSync(path, 'utf8');

// Revert the bad append
code = code.substring(0, code.indexOf('public recordOverlayDecision'));

// Now properly insert it before the closing brace of the class
const insertStr = `
    public recordOverlayDecision(strategy: string, suppressed: boolean, reason?: string) {
        if (suppressed) {
            this.snapshot.counters.portfolioOverlayAdjustments++;
            if (reason) {
                if (!this.snapshot.counters.suppressedByReason[reason]) {
                    this.snapshot.counters.suppressedByReason[reason] = 0;
                }
                this.snapshot.counters.suppressedByReason[reason]++;
            }
            if (!this.snapshot.counters.suppressedByStrategy[strategy]) {
                this.snapshot.counters.suppressedByStrategy[strategy] = 0;
            }
            this.snapshot.counters.suppressedByStrategy[strategy]++;
        }
    }
`;

code = code.replace('}\nexport const diagnosticsService', insertStr + '}\nexport const diagnosticsService');

fs.writeFileSync(path, code);
