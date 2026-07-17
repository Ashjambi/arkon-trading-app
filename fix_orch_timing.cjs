const fs = require('fs');
let code = fs.readFileSync('src/services/ExecutionOrchestrator.ts', 'utf8');

if (!code.includes('import { childOrderTimingOverlayService }')) {
    code = code.replace(
        "import { childOrderSchedulerService } from './ChildOrderSchedulerService';",
        "import { childOrderSchedulerService } from './ChildOrderSchedulerService';\nimport { childOrderTimingOverlayService } from './ChildOrderTimingOverlayService';"
    );
}

const targetCall = `        const parentOrder = {
            symbol: signal.asset,
            strategy: signal.strategy,
            side: signal.direction,
            totalSize: signal.recommendedSize || 0,
            executionStyle: styleResult,
            routeHint: routeResult
        };

        const childOrders = childOrderSchedulerService.schedule(parentOrder as any);`;

const replaceCall = `        const parentOrder = {
            symbol: signal.asset,
            strategy: signal.strategy,
            side: signal.direction,
            totalSize: signal.recommendedSize || 0,
            executionStyle: styleResult,
            routeHint: routeResult
        };

        const childOrders = childOrderSchedulerService.schedule(parentOrder as any);
        const timingPlanSummary = childOrderTimingOverlayService.applyTiming(childOrders);`;

if (!code.includes('const timingPlanSummary = childOrderTimingOverlayService.applyTiming(childOrders);')) {
    code = code.replace(targetCall, replaceCall);
}

// Add timing metadata to trace
// Find where trace.executionDecision is accessed and attach timing plan.
// Actually, it's easier to attach it right where parentTcaSummary is attached, or inside the child loop.
// Inside the child loop:
const tracePushSearch = `                    (trace.executionDecision as any).childDispatches.push({
                        sliceIndex: child.sliceIndex,
                        totalSlices: child.totalSlices,
                        childSize: child.size,
                        executionStyle: child.executionStyle,
                        routeHint: child.routeHint,
                        analytics: analyticsSnapshot
                    });`;
const tracePushReplace = `                    (trace.executionDecision as any).childDispatches.push({
                        sliceIndex: child.sliceIndex,
                        totalSlices: child.totalSlices,
                        childSize: child.size,
                        executionStyle: child.executionStyle,
                        routeHint: child.routeHint,
                        analytics: analyticsSnapshot,
                        dispatchMode: child.dispatchMode,
                        timingPolicy: child.timingPolicy,
                        intervalMs: child.intervalMs,
                        scheduledAtOffsetMs: child.scheduledAtOffsetMs
                    });`;

code = code.replace(tracePushSearch, tracePushReplace);

const parentTcaSearch = `(trace.executionDecision as any).parentTcaSummary = executionTcaAggregatorService.aggregate(childTcaInputs);`;
const parentTcaReplace = `(trace.executionDecision as any).parentTcaSummary = executionTcaAggregatorService.aggregate(childTcaInputs);
                (trace.executionDecision as any).timingPlanSummary = timingPlanSummary;`;

code = code.replace(parentTcaSearch, parentTcaReplace);

// Also attach the timing parameters to childSignal
const childSignalAttachSearch = `            // Attach slice metadata
            (childSignal as any).childOrder = child;
            (childSignal as any).sliceIndex = child.sliceIndex;
            (childSignal as any).totalSlices = child.totalSlices;
            (childSignal as any).executionStyle = child.executionStyle;
            (childSignal as any).routeHint = child.routeHint;`;

const childSignalAttachReplace = `            // Attach slice metadata
            (childSignal as any).childOrder = child;
            (childSignal as any).sliceIndex = child.sliceIndex;
            (childSignal as any).totalSlices = child.totalSlices;
            (childSignal as any).executionStyle = child.executionStyle;
            (childSignal as any).routeHint = child.routeHint;
            (childSignal as any).dispatchMode = child.dispatchMode;
            (childSignal as any).timingPolicy = child.timingPolicy;
            (childSignal as any).intervalMs = child.intervalMs;
            (childSignal as any).scheduledAtOffsetMs = child.scheduledAtOffsetMs;`;

code = code.replace(childSignalAttachSearch, childSignalAttachReplace);


fs.writeFileSync('src/services/ExecutionOrchestrator.ts', code);
