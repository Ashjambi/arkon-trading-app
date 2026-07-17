const fs = require('fs');
let code = fs.readFileSync('src/services/ExecutionOrchestrator.ts', 'utf8');

const targetCall = `        const childOrders = childOrderSchedulerService.schedule(parentOrder);`;

const replaceCall = `        const childOrders = childOrderSchedulerService.schedule(parentOrder);
        const timingPlanSummary = childOrderTimingOverlayService.applyTiming(childOrders);`;

code = code.replace(targetCall, replaceCall);

fs.writeFileSync('src/services/ExecutionOrchestrator.ts', code);
