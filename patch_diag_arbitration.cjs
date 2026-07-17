const fs = require('fs');
const path = './src/services/DiagnosticsService.ts';
let code = fs.readFileSync(path, 'utf8');

code = code.replace(
    'portfolioOverlayAdjustments: number;\n    suppressedByReason: Record<string, number>;\n    suppressedByStrategy: Record<string, number>;\n  };\n}',
    'portfolioOverlayAdjustments: number;\n    suppressedByReason: Record<string, number>;\n    suppressedByStrategy: Record<string, number>;\n    arbitrationDecisions: number;\n    selectedByStrategy: Record<string, number>;\n  };\n}'
);

code = code.replace(
    'portfolioOverlayAdjustments: 0,\n                suppressedByReason: {},\n                suppressedByStrategy: {},\n            }\n        };',
    'portfolioOverlayAdjustments: 0,\n                suppressedByReason: {},\n                suppressedByStrategy: {},\n                arbitrationDecisions: 0,\n                selectedByStrategy: {},\n            }\n        };'
);

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

code = code.replace('}\nexport const diagnosticsService', insertStr + '}\nexport const diagnosticsService');
fs.writeFileSync(path, code);
console.log("Patched DiagnosticsService successfully for arbitration");

