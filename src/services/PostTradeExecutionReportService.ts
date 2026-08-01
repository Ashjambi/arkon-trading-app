export interface PostTradeExecutionChildReport {
    sliceIndex: number;
    totalSlices: number;
    childSize: number;
    dispatchMode?: string;
    timingPolicy?: string;
    intervalMs?: number;
    scheduledAtOffsetMs?: number;
    requestedSize?: number;
    executedSize?: number;
    requestedPrice?: number;
    executedPrice?: number;
    fillRatio?: number;
    slippage?: number;
    slippageBps?: number;
    notionalExecuted?: number;
}

export interface PostTradeExecutionParentReport {
    reportVersion: string;
    generatedAt: string;
    symbol?: string;
    side?: string;
    strategyId?: string;
    executionStyle?: string;
    routeHint?: string;
    childCount: number;
    timingPolicy?: string;
    totalRequestedSize: number;
    totalExecutedSize: number;
    parentFillRatio: number;
    weightedAverageExecutedPrice: number | null;
    weightedAverageRequestedPrice: number | null;
    weightedAverageSlippage: number | null;
    weightedAverageSlippageBps: number | null;
    bestChildSlippageBps: number | null;
    worstChildSlippageBps: number | null;
    totalNotionalExecuted: number | null;
    executionQualityStatus: string;
    executionQualityAlerts: any[];
    pnlByStrategyRegime?: any[];
    shortfallByStrategyRegimeExecutionStyle?: any[];
    realizedAlphaDecayByRegime?: any[];
    topRejectionReasons?: any[];
    executionStyleEffectiveness?: any[];
    persistentMemorySummary?: any;
    decayAdjustedStrategyEdge?: number;
    blockedAlphaSaved?: number;
    blockedAlphaLost?: number;
    calibrationDrift?: number;
    executionStylePolicyEffectiveness?: any[];
    children: PostTradeExecutionChildReport[];
}

export class PostTradeExecutionReportServiceImpl {
    generateReport(traceDecision: any): PostTradeExecutionParentReport | null {
        if (!traceDecision) return null;

        const parentTcaSummary = traceDecision.parentTcaSummary || {};
        const childDispatches = traceDecision.childDispatches || [];
        const timingPlanSummary = traceDecision.timingPlanSummary || {};
        const status = traceDecision.executionQualityStatus || 'ok';
        const alerts = traceDecision.executionQualityAlerts || [];
        
        // Extract some metadata from the first child if available
        let symbol, side, strategyId, executionStyle, routeHint, timingPolicy;
        if (childDispatches.length > 0) {
            const firstChild = childDispatches[0];
            executionStyle = firstChild.executionStyle;
            routeHint = firstChild.routeHint;
            timingPolicy = timingPlanSummary.timingPolicy || firstChild.timingPolicy;
            if (firstChild.analytics) {
                symbol = firstChild.analytics.symbol;
                side = firstChild.analytics.side;
                strategyId = firstChild.analytics.strategy;
            }
        }

        const children: PostTradeExecutionChildReport[] = childDispatches.map((c: any) => {
            return {
                sliceIndex: c.sliceIndex,
                totalSlices: c.totalSlices,
                childSize: c.childSize,
                dispatchMode: c.dispatchMode,
                timingPolicy: c.timingPolicy,
                intervalMs: c.intervalMs,
                scheduledAtOffsetMs: c.scheduledAtOffsetMs,
                requestedSize: c.analytics?.requestedSize,
                executedSize: c.analytics?.executedSize,
                requestedPrice: c.analytics?.requestedPrice,
                executedPrice: c.analytics?.executedPrice,
                fillRatio: c.analytics?.fillRatio,
                slippage: c.analytics?.slippage,
                slippageBps: c.analytics?.slippageBps,
                notionalExecuted: c.analytics?.notionalExecuted,
            };
        });

        const attribution = traceDecision.attribution || {};

        return {
            reportVersion: '1.0',
            generatedAt: new Date().toISOString(),
            symbol,
            side,
            strategyId,
            executionStyle,
            routeHint,
            childCount: parentTcaSummary.childCount || 0,
            timingPolicy,
            totalRequestedSize: parentTcaSummary.totalRequestedSize || 0,
            totalExecutedSize: parentTcaSummary.totalExecutedSize || 0,
            parentFillRatio: parentTcaSummary.parentFillRatio || 0,
            weightedAverageExecutedPrice: parentTcaSummary.weightedAverageExecutedPrice ?? null,
            weightedAverageRequestedPrice: parentTcaSummary.weightedAverageRequestedPrice ?? null,
            weightedAverageSlippage: parentTcaSummary.weightedAverageSlippage ?? null,
            weightedAverageSlippageBps: parentTcaSummary.weightedAverageSlippageBps ?? null,
            bestChildSlippageBps: parentTcaSummary.bestChildSlippageBps ?? null,
            worstChildSlippageBps: parentTcaSummary.worstChildSlippageBps ?? null,
            totalNotionalExecuted: parentTcaSummary.totalNotionalExecuted ?? null,
            executionQualityStatus: status,
            executionQualityAlerts: alerts,
            pnlByStrategyRegime: attribution.pnlByStrategyRegime,
            shortfallByStrategyRegimeExecutionStyle: attribution.shortfallByStrategyRegimeExecutionStyle,
            realizedAlphaDecayByRegime: attribution.realizedAlphaDecayByRegime,
            topRejectionReasons: attribution.topRejectionReasons,
            executionStyleEffectiveness: attribution.executionStyleEffectiveness,
            persistentMemorySummary: attribution.persistentMemorySummary,
            decayAdjustedStrategyEdge: attribution.decayAdjustedStrategyEdge,
            blockedAlphaSaved: attribution.blockedAlphaSaved,
            blockedAlphaLost: attribution.blockedAlphaLost,
            calibrationDrift: attribution.calibrationDrift,
            executionStylePolicyEffectiveness: attribution.executionStylePolicyEffectiveness,
            children
        };
    }
}

export const postTradeExecutionReportService = new PostTradeExecutionReportServiceImpl();
