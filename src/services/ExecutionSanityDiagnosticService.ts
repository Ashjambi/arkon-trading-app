import { ExecutionDecisionTraceSnapshot } from './ExecutionDecisionTraceService';

export interface SanityDiagnosticReport {
    windowStartTime: string;
    windowEndTime: string;
    totalOpportunities: number;
    approvedCount: number;
    rejectedCount: number;
    skippedCount: number;
    errorCount: number;
    rejectionByStage: Record<string, number>;
    recentRejections: Array<{
        timestamp: string;
        stage: string;
        reasonCode: string;
        reason: string;
        asset?: string;
        strategy?: string;
    }>;
}

export class ExecutionSanityDiagnosticServiceImpl {
    private history: ExecutionDecisionTraceSnapshot[] = [];

    public recordTrace(trace: ExecutionDecisionTraceSnapshot | null) {
        if (!trace) return;
        // Clone to keep history safe
        this.history.push(JSON.parse(JSON.stringify(trace)));
        // Simple cleanup for memory safety (keep last 1000)
        if (this.history.length > 1000) {
            this.history.shift();
        }
    }

    public generateDiagnosticReport(windowMs: number = 24 * 60 * 60 * 1000): SanityDiagnosticReport {
        const now = Date.now();
        const cutoff = now - windowMs;
        
        const relevantTraces = this.history.filter(t => new Date(t.createdAt).getTime() >= cutoff);
        
        let approvedCount = 0;
        let rejectedCount = 0;
        let skippedCount = 0;
        let errorCount = 0;
        const rejectionByStage: Record<string, number> = {};
        const recentRejections: any[] = [];

        for (const trace of relevantTraces) {
            const dec = trace.executionDecision;
            if (!dec) {
                errorCount++;
                continue;
            }

            if (dec.dispatched) {
                approvedCount++;
            } else if (dec.attempted && !dec.dispatched) {
                const stage = dec.blockedStage || 'UNKNOWN';
                let reasonCode = 'UNKNOWN';
                let reason = dec.reason || 'Unknown reason';

                if (stage === 'PRE_TRADE' && trace.preTradeDecision) {
                    reasonCode = trace.preTradeDecision.code || reasonCode;
                }

                if (stage === 'EXECUTION_HINTS' || stage === 'SKIPPED' || reasonCode === 'EXECUTION_HINT_SKIP') {
                    skippedCount++;
                } else if (stage === 'EXECUTION_FAILED' || stage === 'BRIDGE_FAILURE' || stage === 'ERROR') {
                    errorCount++;
                } else {
                    rejectedCount++;
                }

                if (stage !== 'EXECUTION_HINTS' && stage !== 'SKIPPED' && reasonCode !== 'EXECUTION_HINT_SKIP') {
                    rejectionByStage[stage] = (rejectionByStage[stage] || 0) + 1;
                    
                    recentRejections.push({
                        timestamp: trace.createdAt,
                        stage,
                        reasonCode,
                        reason,
                        asset: trace.signal?.asset,
                        strategy: trace.signal?.strategy
                    });
                }
            } else {
                // Not attempted, not dispatched => ended early without block/dispatch => ERROR
                errorCount++;
            }
        }

        return {
            windowStartTime: new Date(cutoff).toISOString(),
            windowEndTime: new Date(now).toISOString(),
            totalOpportunities: relevantTraces.length,
            approvedCount,
            rejectedCount,
            skippedCount,
            errorCount,
            rejectionByStage,
            recentRejections: recentRejections.slice(-50) // only top 50 recent
        };
    }

    public recordRejection(signalId: string, stage: string, reasonCode: string, reason: string) {
        // Find the trace
        // Note: signalId might be the child slice ID (e.g. BTC_AVR-BTC-PERPETUAL-SHORT-29737297-SLICE-0)
        // or just the parent ID. We will do a partial match.
        const trace = this.history.find(t => t.signal?.id === signalId || (t.signal && signalId.startsWith(t.signal.id)));
        if (trace && trace.executionDecision) {
            trace.executionDecision.dispatched = false;
            trace.executionDecision.attempted = true;
            trace.executionDecision.blockedStage = stage;
            trace.executionDecision.reason = reason;
            
            // Add custom pretrade decision to hold the code
            if (!trace.preTradeDecision) {
                trace.preTradeDecision = {
                    allowed: false,
                    code: reasonCode,
                    reason: reason,
                    timestamp: Date.now()
                };
            } else {
                trace.preTradeDecision.code = reasonCode;
                trace.preTradeDecision.reason = reason;
            }
        }
    }

    public reset() {
        this.history = [];
    }
}

export const executionSanityDiagnosticService = new ExecutionSanityDiagnosticServiceImpl();
