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
            totalNotionalExecuted: hasAnyNotional ? totalNotionalExecutedOverall : null
        };
    }
}

export const executionTcaAggregatorService = new ExecutionTcaAggregatorService();
