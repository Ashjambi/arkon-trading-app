export type ExecutionAnalyticsInput = {
    symbol: string;
    strategy: string;
    side: 'BUY' | 'SELL';
    requestedSize: number;
    executedSize: number;
    requestedPrice?: number | null;
    executedPrice?: number | null;
    timestamp: string;
    executionStyle: 'AGGRESSIVE' | 'MID' | 'PASSIVE';
    routeHint: 'PRIMARY' | 'SECONDARY' | 'DARK' | 'INTERNAL';
};

export type ExecutionAnalyticsSnapshot = {
    slippage: number | null;
    slippageBps: number | null;
    fillRatio: number;
    notionalExecuted: number | null;
    decisionLatencyMs: number | null;
    delayCost: number | null;
    executionCost: number | null;
    opportunityCost: number | null;
    implementationShortfall: number | null;
    strategyRegimeAttribution?: string | null;
};

class ExecutionAnalyticsServiceImpl {
    compute(input: ExecutionAnalyticsInput): ExecutionAnalyticsSnapshot {
        let fillRatio = 0;
        if (input.requestedSize > 0) {
            fillRatio = input.executedSize / input.requestedSize;
        }

        let slippage: number | null = null;
        let slippageBps: number | null = null;
        
        if (input.requestedPrice !== undefined && input.requestedPrice !== null && 
            input.executedPrice !== undefined && input.executedPrice !== null && 
            input.requestedPrice > 0) {
            
            if (input.side === 'BUY') {
                slippage = input.executedPrice - input.requestedPrice;
            } else {
                slippage = input.requestedPrice - input.executedPrice;
            }
            slippageBps = (slippage / input.requestedPrice) * 10000;
        }

        let notionalExecuted: number | null = null;
        if (input.executedPrice !== undefined && input.executedPrice !== null) {
            notionalExecuted = input.executedSize * input.executedPrice;
        }

        const delayCost = input.executionStyle === 'PASSIVE' ? Math.abs((slippage ?? 0) * 0.5) : null;
        const executionCost = slippage !== null ? Math.abs(slippage) : null;
        const opportunityCost = fillRatio < 1 ? Math.abs((input.requestedSize - input.executedSize) * (input.requestedPrice ?? 0) * 0.01) : null;
        const implementationShortfall = (slippage !== null ? slippage : 0) + (opportunityCost ?? 0) + (delayCost ?? 0);

        return {
            slippage,
            slippageBps,
            fillRatio,
            notionalExecuted,
            decisionLatencyMs: null,
            delayCost,
            executionCost,
            opportunityCost,
            implementationShortfall,
            strategyRegimeAttribution: `${input.strategy}:${input.executionStyle}`
        };
    }
}

export const executionAnalyticsService = new ExecutionAnalyticsServiceImpl();
