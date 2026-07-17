const fs = require('fs');
const path = './src/services/DiagnosticsService.ts';
let code = fs.readFileSync(path, 'utf8');

if (!code.includes('riskExposureBlockedTotal')) {
    // interface
    code = code.replace(
        /executionSkipped: number;/,
        'executionSkipped: number;\n    riskExposureBlockedTotal: number;\n    riskExposureBlockedByReason: Record<string, number>;'
    );
    // init
    code = code.replace(
        /executionSkipped: 0,/,
        'executionSkipped: 0,\n                riskExposureBlockedTotal: 0,\n                riskExposureBlockedByReason: {},'
    );

    // method
    const newMethod = `
    public recordExposureBlocked(code: string, reason: string): void {
        this.snapshot.counters.riskExposureBlockedTotal++;
        if (!this.snapshot.counters.riskExposureBlockedByReason[code]) {
            this.snapshot.counters.riskExposureBlockedByReason[code] = 0;
        }
        this.snapshot.counters.riskExposureBlockedByReason[code]++;
    }
`;
    code = code.replace(/public recordExecutionQuality/g, newMethod + '\n    public recordExecutionQuality');
    fs.writeFileSync(path, code);
}
