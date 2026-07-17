const fs = require('fs');
let code = fs.readFileSync('src/services/ExecutionOrchestrator.ts', 'utf8');

const oldDispatchBlock = `        // --- EXECUTION ANALYTICS STUB ---
        const analyticsInput = {
            symbol: signalToSend.asset || 'UNKNOWN',
            strategy: signalToSend.strategy || 'UNKNOWN',
            side: (signalToSend.direction === 'LONG' || actionType === 'ENTRY') ? 'BUY' : 'SELL',
            requestedSize: candidate.size || 0,
            executedSize: executedLotSize,
            requestedPrice: signalToSend.entry,
            executedPrice: signalToSend.entry, // Placeholder assumption
            timestamp: new Date().toISOString(),
            executionStyle: (signalToSend as any).executionStyle || 'PASSIVE',
            routeHint: routeHint as any
        };
        const analyticsSnapshot = executionAnalyticsService.compute(analyticsInput as any);
        (signalToSend as any).executionAnalytics = analyticsSnapshot;

        if (executionDecisionTraceService && executionDecisionTraceService.getLatestSnapshot()) {
            const trace = executionDecisionTraceService.getLatestSnapshot();
            if (trace && trace.executionDecision) {
                (trace.executionDecision as any).executionAnalytics = analyticsSnapshot;
            }
        }

        executionDecisionTraceService.recordPreTrade(true);
        try {
            const result = await sendToWebhook(
                signalToSend,
                this.config.webhookUrl,
                this.config.maxAllocationPerTradePercent,
                actionType,
                executedLotSize,
                this.config.webhookSecret,
                this.config.forceClosePnL
            );

if (result.success) {
                strategyRiskBudgetService.registerAllocation(strategyName, executedLotSize);
                    riskLimitsService.registerExecutedOrder(
                    signalToSend.asset || 'UNKNOWN',
                    actionType as string,
                    executedLotSize,
                    executedLotSize * (signalToSend.entry || 0),
                    isRiskReducing
                );
                this.addLog(\`🚀 تم تنفيذ: \${actionType} لـ \${signalToSend.asset || 'System'}\`, 'EXEC');
                executionDecisionTraceService.recordDispatch();
                if (this.config.enableTelegramAlerts && this.config.telegramBotToken) {
                    this.sendAlerts(signalToSend, actionType, crlState);
                }
                return true;
            }
        } catch (err) {
            this.addLog(\`خطأ في الوصول للجسر\`, 'ERROR');
        }
        return false;`;

const newDispatchBlock = `        executionDecisionTraceService.recordPreTrade(true);
        let allSuccess = true;

        for (const child of childOrders) {
            const childSignal = { ...signalToSend };
            // Update the size for this specific child
            (childSignal as any).size = child.size;
            
            // Attach slice metadata
            (childSignal as any).childOrder = child;
            (childSignal as any).sliceIndex = child.sliceIndex;
            (childSignal as any).totalSlices = child.totalSlices;

            // --- EXECUTION ANALYTICS STUB (PER CHILD) ---
            const analyticsInput = {
                symbol: child.symbol || 'UNKNOWN',
                strategy: child.strategy || 'UNKNOWN',
                side: child.side,
                requestedSize: child.size,
                executedSize: child.size,
                requestedPrice: childSignal.entry,
                executedPrice: childSignal.entry, // Placeholder assumption
                timestamp: new Date().toISOString(),
                executionStyle: child.executionStyle,
                routeHint: child.routeHint
            };
            const analyticsSnapshot = executionAnalyticsService.compute(analyticsInput as any);
            (childSignal as any).executionAnalytics = analyticsSnapshot;

            if (executionDecisionTraceService && executionDecisionTraceService.getLatestSnapshot()) {
                const trace = executionDecisionTraceService.getLatestSnapshot();
                if (trace && trace.executionDecision) {
                    if (!(trace.executionDecision as any).childDispatches) {
                        (trace.executionDecision as any).childDispatches = [];
                    }
                    (trace.executionDecision as any).childDispatches.push({
                        sliceIndex: child.sliceIndex,
                        totalSlices: child.totalSlices,
                        childSize: child.size,
                        executionStyle: child.executionStyle,
                        routeHint: child.routeHint,
                        analytics: analyticsSnapshot
                    });
                    
                    // Keep the parent level executionAnalytics for backward compatibility with tests
                    if (child.sliceIndex === 0) {
                        (trace.executionDecision as any).executionAnalytics = analyticsSnapshot;
                    }
                }
            }

            try {
                const result = await sendToWebhook(
                    childSignal,
                    this.config.webhookUrl,
                    this.config.maxAllocationPerTradePercent,
                    actionType,
                    child.size,
                    this.config.webhookSecret,
                    this.config.forceClosePnL
                );

                if (result.success) {
                    strategyRiskBudgetService.registerAllocation(strategyName, child.size);
                    riskLimitsService.registerExecutedOrder(
                        childSignal.asset || 'UNKNOWN',
                        actionType as string,
                        child.size,
                        child.size * (childSignal.entry || 0),
                        isRiskReducing
                    );
                    this.addLog(\`🚀 تم تنفيذ جزء: \${actionType} لـ \${childSignal.asset || 'System'} (\${child.sliceIndex + 1}/\${child.totalSlices})\`, 'EXEC');
                    executionDecisionTraceService.recordDispatch();
                    if (this.config.enableTelegramAlerts && this.config.telegramBotToken) {
                        this.sendAlerts(childSignal, actionType, crlState);
                    }
                } else {
                    allSuccess = false;
                }
            } catch (err) {
                this.addLog(\`خطأ في الوصول للجسر\`, 'ERROR');
                allSuccess = false;
            }
        }

        return allSuccess;`;

if (code.includes('const analyticsSnapshot = executionAnalyticsService.compute(analyticsInput as any);')) {
    code = code.replace(oldDispatchBlock, newDispatchBlock);
    fs.writeFileSync('src/services/ExecutionOrchestrator.ts', code);
    console.log('Patched ExecutionOrchestrator.ts');
} else {
    console.log('Could not find target block to replace.');
}
