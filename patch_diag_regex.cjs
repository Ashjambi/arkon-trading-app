const fs = require('fs');
const path = './src/services/DiagnosticsService.ts';
let code = fs.readFileSync(path, 'utf8');

const interfaceTarget = /portfolioOverlayAdjustments: number;\s*suppressedByReason: Record<string, number>;\s*suppressedByStrategy: Record<string, number>;\s*};\s*}/g;
code = code.replace(interfaceTarget, `portfolioOverlayAdjustments: number;
    suppressedByReason: Record<string, number>;
    suppressedByStrategy: Record<string, number>;
    arbitrationDecisions: number;
    selectedByStrategy: Record<string, number>;
  };
}`);

const initTarget = /portfolioOverlayAdjustments: 0,\s*suppressedByReason: \{\},\s*suppressedByStrategy: \{\},\s*\}\s*\};\s*}/g;
code = code.replace(initTarget, `portfolioOverlayAdjustments: 0,
                suppressedByReason: {},
                suppressedByStrategy: {},
                arbitrationDecisions: 0,
                selectedByStrategy: {},
            }
        };
    }`);


const insertStr = `
    public recordArbitrationDecision(strategy: string, selected: boolean, reason?: string) {
        this.snapshot.counters.arbitrationDecisions++;
        if (selected) {
            if (!this.snapshot.counters.selectedByStrategy[strategy]) {
                this.snapshot.counters.selectedByStrategy[strategy] = 0;
            }
            this.snapshot.counters.selectedByStrategy[strategy]++;
        } else {
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

code = code.replace(/\}\s*export const diagnosticsService/, insertStr + '}\nexport const diagnosticsService');

fs.writeFileSync(path, code);
console.log("Patched correctly.");
