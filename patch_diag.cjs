const fs = require('fs');
const path = './src/services/DiagnosticsService.ts';
let code = fs.readFileSync(path, 'utf8');

code = code.replace(
    'degradedSignals: number;\n  };\n}',
    'degradedSignals: number;\n    portfolioOverlayAdjustments: number;\n    suppressedByReason: Record<string, number>;\n    suppressedByStrategy: Record<string, number>;\n  };\n}'
);

code = code.replace(
    'degradedSignals: 0,\n            }\n        };',
    'degradedSignals: 0,\n                portfolioOverlayAdjustments: 0,\n                suppressedByReason: {},\n                suppressedByStrategy: {},\n            }\n        };'
);

code += `
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

fs.writeFileSync(path, code);
