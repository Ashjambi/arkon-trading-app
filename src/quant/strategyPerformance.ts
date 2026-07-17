import { StrategyPerformance, StrategyType } from '../types';

// Strategy Performance Tracker: Monitors and scores strategies in real-time
export const strategyPerformanceTracker = {
    // Threshold to automatically disable a strategy
    DISABLE_THRESHOLD: 40, 

    // Update performance metrics based on trade outcome
    updatePerformance: (
        perf: StrategyPerformance, 
        pnlPoints: number, 
        isWin: boolean
    ): StrategyPerformance => {
        const updatedPerf = { ...perf };
        
        updatedPerf.totalTrades += 1;
        if (isWin) {
            updatedPerf.wins += 1;
            updatedPerf.totalProfitPoints += pnlPoints;
            updatedPerf.consecutiveLosses = 0;
        } else {
            updatedPerf.losses += 1;
            updatedPerf.totalLossPoints += Math.abs(pnlPoints);
            updatedPerf.consecutiveLosses += 1;
        }

        // Recalculate metrics
        updatedPerf.winRate = updatedPerf.wins / updatedPerf.totalTrades;
        updatedPerf.profitFactor = updatedPerf.totalLossPoints !== 0 
            ? (updatedPerf.totalProfitPoints / updatedPerf.totalLossPoints) 
            : (updatedPerf.totalProfitPoints > 0 ? 2 : 0);

        // Success Score: Weighted combination of WinRate and ProfitFactor
        let score = (updatedPerf.winRate * 100) * (updatedPerf.profitFactor > 1 ? 1.2 : 0.8);
        
        // Penalties
        if (updatedPerf.consecutiveLosses >= 3) score -= 15;
        
        updatedPerf.successScore = Math.round(Math.max(0, Math.min(100, score)));

        // Auto-disable if performance is poor
        if (updatedPerf.successScore < strategyPerformanceTracker.DISABLE_THRESHOLD) {
            updatedPerf.isEnabled = false;
        }

        return updatedPerf;
    },

    // Check if strategy is allowed to trade
    isStrategyEnabled: (perf: StrategyPerformance) => {
        return perf.isEnabled;
    }
};
