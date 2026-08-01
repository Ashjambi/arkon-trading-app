export type ChildExecutionTcaInput = {
    requestedSize: number;
    executedSize: number;
    requestedPrice?: number | null;
    executedPrice?: number | null;
    fillRatio: number;
    slippage?: number | null;
    slippageBps?: number | null;
    notionalExecuted?: number | null;
    sliceIndex: number;
    totalSlices: number;
};

export type ParentExecutionTcaSummary = {
    totalRequestedSize: number;
    totalExecutedSize: number;
    parentFillRatio: number;
    childCount: number;
    weightedAverageExecutedPrice?: number | null;
    weightedAverageRequestedPrice?: number | null;
    weightedAverageSlippage?: number | null;
    weightedAverageSlippageBps?: number | null;
    bestChildSlippageBps?: number | null;
    worstChildSlippageBps?: number | null;
    totalNotionalExecuted?: number | null;
    totalDelayCost?: number | null;
    totalExecutionCost?: number | null;
    totalOpportunityCost?: number | null;
    implementationShortfall?: number | null;
    strategyRegimeAttribution?: string[];
};

export class ExecutionTcaAggregatorService {
    aggregate(children: ChildExecutionTcaInput[]): ParentExecutionTcaSummary {
        let totalRequestedSize = 0;
        let totalExecutedSize = 0;
        let childCount = children.length;

        let totalExecutedNotional = 0;
        let executedSizeWithPrice = 0;

        let totalRequestedNotional = 0;
        let requestedSizeWithPrice = 0;

        let totalSlippageWeighted = 0;
        let executedSizeWithSlippage = 0;

        let totalSlippageBpsWeighted = 0;
        let executedSizeWithSlippageBps = 0;

        let bestChildSlippageBps: number | null = null;
        let worstChildSlippageBps: number | null = null;

        let totalNotionalExecutedOverall: number | null = null;
        let hasAnyNotional = false;
        let totalDelayCost = 0;
        let totalExecutionCost = 0;
        let totalOpportunityCost = 0;
        let implementationShortfall = 0;
        const strategyRegimeAttribution: string[] = [];

        for (const child of children) {
            totalRequestedSize += child.requestedSize;
            totalExecutedSize += child.executedSize;

            if (child.executedPrice != null && child.executedSize > 0) {
                totalExecutedNotional += child.executedPrice * child.executedSize;
                executedSizeWithPrice += child.executedSize;
            }

            if (child.requestedPrice != null && child.requestedSize > 0) {
                totalRequestedNotional += child.requestedPrice * child.requestedSize;
                requestedSizeWithPrice += child.requestedSize;
            }

            if (child.slippage != null && child.executedSize > 0) {
                totalSlippageWeighted += child.slippage * child.executedSize;
                executedSizeWithSlippage += child.executedSize;
            }

            if (child.slippageBps != null) {
                if (child.executedSize > 0) {
                    totalSlippageBpsWeighted += child.slippageBps * child.executedSize;
                    executedSizeWithSlippageBps += child.executedSize;
                }

                if (bestChildSlippageBps === null || child.slippageBps < bestChildSlippageBps) {
                    bestChildSlippageBps = child.slippageBps;
                }
                if (worstChildSlippageBps === null || child.slippageBps > worstChildSlippageBps) {
                    worstChildSlippageBps = child.slippageBps;
                }
            }

            if (child.notionalExecuted != null) {
                hasAnyNotional = true;
                totalNotionalExecutedOverall = (totalNotionalExecutedOverall || 0) + child.notionalExecuted;
            }

            totalDelayCost += child.slippage != null && child.slippage > 0 ? child.slippage * 0.5 : 0;
            totalExecutionCost += child.slippage != null ? Math.abs(child.slippage) : 0;
            totalOpportunityCost += child.fillRatio < 1 ? Math.abs((child.requestedSize - child.executedSize) * (child.requestedPrice ?? 0) * 0.01) : 0;
            implementationShortfall += (child.slippage != null ? child.slippage : 0) + (child.fillRatio < 1 ? Math.abs((child.requestedSize - child.executedSize) * (child.requestedPrice ?? 0) * 0.01) : 0);
            strategyRegimeAttribution.push(`slice:${child.sliceIndex}`);
        }

        const parentFillRatio = totalRequestedSize > 0 ? totalExecutedSize / totalRequestedSize : 0;

        const weightedAverageExecutedPrice = executedSizeWithPrice > 0 
            ? totalExecutedNotional / executedSizeWithPrice 
            : null;

        const weightedAverageRequestedPrice = requestedSizeWithPrice > 0
            ? totalRequestedNotional / requestedSizeWithPrice
            : null;

        const weightedAverageSlippage = executedSizeWithSlippage > 0
            ? totalSlippageWeighted / executedSizeWithSlippage
            : null;

        const weightedAverageSlippageBps = executedSizeWithSlippageBps > 0
            ? totalSlippageBpsWeighted / executedSizeWithSlippageBps
            : null;

        return {
            totalRequestedSize,
            totalExecutedSize,
            parentFillRatio,
            childCount,
            weightedAverageExecutedPrice,
            weightedAverageRequestedPrice,
            weightedAverageSlippage,
            weightedAverageSlippageBps,
            bestChildSlippageBps,
            worstChildSlippageBps,
            totalNotionalExecuted: hasAnyNotional ? totalNotionalExecutedOverall : null,
            totalDelayCost,
            totalExecutionCost,
            totalOpportunityCost,
            implementationShortfall,
            strategyRegimeAttribution
        };
    }
}

export const executionTcaAggregatorService = new ExecutionTcaAggregatorService();
