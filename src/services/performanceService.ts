import { LogEntry } from '../types';

export interface StrategyPerformance {
    pnl: number;
    winRate: number;
    totalTrades: number;
    grossProfit: number;
    grossLoss: number;
    profitFactor: number;
    maxDrawdown: number;
    sortinoRatio: number;
    wins: number;
    losses: number;
    successScore: number;
}

export interface PerformanceMetrics {
    [asset: string]: {
        [strategy: string]: StrategyPerformance;
    };
}

export const calculatePerformance = (history: any[]): PerformanceMetrics => {
    const metrics: PerformanceMetrics = {};

    history.forEach(trade => {
        const asset = trade.asset;
        const strategy = trade.strategy || 'UNKNOWN';
        
        if (!metrics[asset]) metrics[asset] = {};
        if (!metrics[asset][strategy]) {
            metrics[asset][strategy] = { 
                pnl: 0, winRate: 0, totalTrades: 0, 
                grossProfit: 0, grossLoss: 0, profitFactor: 0, 
                maxDrawdown: 0, sortinoRatio: 0, wins: 0, losses: 0, successScore: 0
            };
        }

        const m = metrics[asset][strategy];
        m.totalTrades += 1;
        const pnl = trade.pnlPoints || 0;
        m.pnl += pnl;

        if (trade.outcome === 'WIN' || pnl > 0) {
            m.wins += 1;
            m.grossProfit += pnl;
        } else if (trade.outcome === 'LOSS' || pnl < 0) {
            m.losses += 1;
            m.grossLoss += Math.abs(pnl);
        }

        m.winRate = (m.wins + m.losses) > 0 ? (m.wins / (m.wins + m.losses)) : 0;
        m.profitFactor = m.grossLoss !== 0 ? (m.grossProfit / m.grossLoss) : (m.grossProfit > 0 ? Infinity : 0);
        
        // Calculate successScore: winRate * 100 * (profitFactor > 1 ? 1.2 : 0.8)
        m.successScore = (m.winRate * 100) * (m.profitFactor > 1 ? 1.2 : 0.8);

        // Simplified Max Drawdown: tracking peak to trough
        const currentDrawdown = Math.max(0, (metrics[asset][strategy].pnl || 0) - m.pnl);
        m.maxDrawdown = Math.max(m.maxDrawdown, currentDrawdown);
    });

    return metrics;
};
