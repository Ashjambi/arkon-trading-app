const fs = require('fs');
const path = './src/services/DiagnosticsService.ts';
let code = fs.readFileSync(path, 'utf8');

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

// Replace `    }\n}` with `    }\n` + insertStr + `\n}`
const target = `    }\n}`;
if (code.includes(target)) {
    code = code.replace(target, `    }\n` + insertStr + `\n}`);
    fs.writeFileSync(path, code);
    console.log("Patched successfully");
} else {
    console.log("Could not find target to patch");
}
