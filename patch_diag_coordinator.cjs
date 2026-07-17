const fs = require('fs');
const path = './src/services/DiagnosticsService.ts';
let code = fs.readFileSync(path, 'utf8');

const interfaceTarget = /arbitrationDecisions: number;\s*selectedByStrategy: Record<string, number>;\s*};\s*}/g;
code = code.replace(interfaceTarget, `arbitrationDecisions: number;
    selectedByStrategy: Record<string, number>;
    coordinationRuns: number;
    coordinationInputSignals: number;
    coordinationFinalSignals: number;
  };
}`);

const initTarget = /arbitrationDecisions: 0,\s*selectedByStrategy: \{\},\s*\}\s*\};\s*}/g;
code = code.replace(initTarget, `arbitrationDecisions: 0,
                selectedByStrategy: {},
                coordinationRuns: 0,
                coordinationInputSignals: 0,
                coordinationFinalSignals: 0,
            }
        };
    }`);


const insertStr = `
    public recordCoordinationRun(inputCount: number, finalCount: number) {
        this.snapshot.counters.coordinationRuns++;
        this.snapshot.counters.coordinationInputSignals += inputCount;
        this.snapshot.counters.coordinationFinalSignals += finalCount;
    }
`;

code = code.replace(/\}\s*export const diagnosticsService/, insertStr + '}\nexport const diagnosticsService');

fs.writeFileSync(path, code);
console.log("Patched DiagnosticsService for MultiStrategySignalCoordinatorService.");
