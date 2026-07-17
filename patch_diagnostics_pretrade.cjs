const fs = require('fs');
const path = './src/services/DiagnosticsService.ts';
let code = fs.readFileSync(path, 'utf8');

if (!code.includes('preTradeBlockedTotal')) {
    // Add counters to interface
    code = code.replace(`counters: {`, `counters: {\n    preTradeBlockedTotal: number;\n    preTradeBlockedByReason: Record<string, number>;`);
    
    // Initialize in constructor
    code = code.replace(`counters: {`, `counters: {\n                preTradeBlockedTotal: 0,\n                preTradeBlockedByReason: {},`);

    // Add method
    const method = `
    public recordPreTradeBlocked(decisionCode: string, reason: string): void {
        this.snapshot.counters.preTradeBlockedTotal++;
        if (!this.snapshot.counters.preTradeBlockedByReason[decisionCode]) {
            this.snapshot.counters.preTradeBlockedByReason[decisionCode] = 0;
        }
        this.snapshot.counters.preTradeBlockedByReason[decisionCode]++;
    }
`;
    
    code = code.replace(`public recordExecutionQuality`, `${method}\n    public recordExecutionQuality`);

    fs.writeFileSync(path, code);
}
