export interface ExecutionQualityAlert {
    code: string;
    severity: 'info' | 'warning' | 'critical';
    message: string;
    metric?: string;
    observedValue?: number | null;
    threshold?: number;
    context?: any;
}

export interface ExecutionQualityMonitorResult {
    executionQualityStatus: 'ok' | 'warning' | 'critical';
    executionQualityAlerts: ExecutionQualityAlert[];
}

export class ExecutionQualityMonitorServiceImpl {
    private readonly FILL_RATIO_WARNING_THRESHOLD = 0.9;
    private readonly FILL_RATIO_CRITICAL_THRESHOLD = 0.5;
    private readonly HIGH_WEIGHTED_SLIPPAGE_BPS_THRESHOLD = 10;
    private readonly CHILD_SLIPPAGE_SPIKE_THRESHOLD = 20;

    evaluate(traceDecision: any): ExecutionQualityMonitorResult {
        const alerts: ExecutionQualityAlert[] = [];
        let status: 'ok' | 'warning' | 'critical' = 'ok';

        if (!traceDecision || !traceDecision.childDispatches || traceDecision.childDispatches.length === 0) {
            return { executionQualityStatus: 'ok', executionQualityAlerts: [] };
        }

        const parentTcaSummary = traceDecision.parentTcaSummary;
        const timingPlanSummary = traceDecision.timingPlanSummary;
        const childDispatches = traceDecision.childDispatches;

        if (!parentTcaSummary) {
            alerts.push({
                code: 'MISSING_PARENT_TCA',
                severity: 'warning',
                message: 'Child dispatches exist but parentTcaSummary is missing.'
            });
        } else {
            if (parentTcaSummary.parentFillRatio < this.FILL_RATIO_CRITICAL_THRESHOLD) {
                alerts.push({
                    code: 'LOW_FILL_RATIO',
                    severity: 'critical',
                    message: `Parent fill ratio is critically low: ${parentTcaSummary.parentFillRatio}`,
                    metric: 'parentFillRatio',
                    observedValue: parentTcaSummary.parentFillRatio,
                    threshold: this.FILL_RATIO_CRITICAL_THRESHOLD
                });
            } else if (parentTcaSummary.parentFillRatio < this.FILL_RATIO_WARNING_THRESHOLD) {
                alerts.push({
                    code: 'LOW_FILL_RATIO',
                    severity: 'warning',
                    message: `Parent fill ratio is below warning threshold: ${parentTcaSummary.parentFillRatio}`,
                    metric: 'parentFillRatio',
                    observedValue: parentTcaSummary.parentFillRatio,
                    threshold: this.FILL_RATIO_WARNING_THRESHOLD
                });
            }

            if (parentTcaSummary.weightedAverageSlippageBps !== null && parentTcaSummary.weightedAverageSlippageBps !== undefined) {
                if (parentTcaSummary.weightedAverageSlippageBps > this.HIGH_WEIGHTED_SLIPPAGE_BPS_THRESHOLD) {
                    alerts.push({
                        code: 'HIGH_WEIGHTED_SLIPPAGE_BPS',
                        severity: 'warning',
                        message: `Weighted average slippage BPS is high: ${parentTcaSummary.weightedAverageSlippageBps}`,
                        metric: 'weightedAverageSlippageBps',
                        observedValue: parentTcaSummary.weightedAverageSlippageBps,
                        threshold: this.HIGH_WEIGHTED_SLIPPAGE_BPS_THRESHOLD
                    });
                }
            }

            if (parentTcaSummary.worstChildSlippageBps !== null && parentTcaSummary.worstChildSlippageBps !== undefined) {
                if (parentTcaSummary.worstChildSlippageBps > this.CHILD_SLIPPAGE_SPIKE_THRESHOLD) {
                    alerts.push({
                        code: 'CHILD_SLIPPAGE_SPIKE',
                        severity: 'warning',
                        message: `Worst child slippage BPS spiked: ${parentTcaSummary.worstChildSlippageBps}`,
                        metric: 'worstChildSlippageBps',
                        observedValue: parentTcaSummary.worstChildSlippageBps,
                        threshold: this.CHILD_SLIPPAGE_SPIKE_THRESHOLD
                    });
                }
            }
        }

        let missingTiming = false;
        if (!timingPlanSummary) {
            missingTiming = true;
        } else {
            for (const child of childDispatches) {
                if (child.dispatchMode === undefined || child.timingPolicy === undefined) {
                    missingTiming = true;
                    break;
                }
            }
        }

        if (missingTiming) {
            alerts.push({
                code: 'TIMING_METADATA_INCOMPLETE',
                severity: 'warning',
                message: 'Timing metadata is missing or incomplete for child dispatches.'
            });
        }

        for (const alert of alerts) {
            if (alert.severity === 'critical') {
                status = 'critical';
            } else if (alert.severity === 'warning' && status !== 'critical') {
                status = 'warning';
            }
        }

        return { executionQualityStatus: status, executionQualityAlerts: alerts };
    }
}

export const executionQualityMonitorService = new ExecutionQualityMonitorServiceImpl();
