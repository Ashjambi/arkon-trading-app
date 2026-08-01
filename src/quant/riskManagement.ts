import { mean, std } from 'mathjs';

export const calculateRealizedVolatility = (prices: number[], lookback: number = 20): number => {
    if (!Array.isArray(prices) || prices.length < 2) return 0;
    const window = prices.slice(Math.max(0, prices.length - lookback));
    if (window.length < 2) return 0;
    const returns = window.slice(1).map((price, idx) => {
        const prev = window[idx];
        if (prev <= 0 || price <= 0) return 0;
        return Math.log(price / prev);
    }).filter((value) => Number.isFinite(value));
    if (returns.length < 2) return 0;
    const rv = Number(std(returns));
    return Number.isFinite(rv) ? Math.max(0, rv) : 0;
};

export const riskManagement = {
    // Fractional Kelly Criterion (e.g., 0.1 for conservative sizing)
    calculatePositionSize: (capital: number, winProbability: number, winLossRatio: number, fraction: number = 0.1) => {
        const kelly = winProbability - ((1 - winProbability) / winLossRatio);
        return capital * Math.max(0, kelly) * fraction;
    },

    // Volatility-Adjusted Position Sizing (Institutional Standard)
    // Reduces position size as market volatility (sigma) increases
    calculateVolatilityAdjustedSize: (capital: number, sigma: number, targetRisk: number = 0.02) => {
        if (sigma === 0) return 0;
        // Position Size = (Capital * RiskPerTrade) / Volatility
        return (capital * targetRisk) / sigma;
    },
    // Expected Shortfall (CVaR) - more robust than VaR
    calculateCVaR: (returns: number[], confidenceLevel: number = 0.95) => {
        if (!Array.isArray(returns) || returns.length === 0) return 0;
        const sortedReturns = [...returns].sort((a, b) => a - b);
        const index = Math.max(1, Math.floor((1 - confidenceLevel) * sortedReturns.length));
        const tailReturns = sortedReturns.slice(0, index);
        const tailMean = mean(tailReturns) as number;
        return Number.isFinite(tailMean) ? Number(tailMean) : 0;
    },
    // Correlation-based Risk Adjustment
    // Reduces position size if assets are highly correlated to avoid over-exposure
    calculateCorrelationAdjustment: (currentPositionSize: number, correlation: number) => {
        // If correlation is high (e.g., > 0.7), reduce position size by 50%
        if (correlation > 0.7) return currentPositionSize * 0.5;
        if (correlation > 0.5) return currentPositionSize * 0.8;
        return currentPositionSize;
    },
    // Stress testing
    stressTest: (scenario: string, portfolioValue: number) => {
        // Institutional stress test logic (e.g., -20% shock)
        const shock = scenario === 'CRASH' ? -0.2 : -0.05;
        return portfolioValue * (1 + shock);
    }
};
