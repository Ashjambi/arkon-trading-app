import { std, mean } from 'mathjs';

// Regime Detector: Identifies if the market is Trending or Mean-Reverting
export const regimeDetector = {
    // Calculate Hurst Exponent (0 < H < 0.5: Mean Reverting, 0.5: Random Walk, 0.5 < H < 1: Trending)
    calculateHurst: (prices: number[]) => {
        if (prices.length < 100) return 0.5; // Default to random walk if insufficient data

        const n = prices.length;
        const logReturns = [];
        for (let i = 1; i < n; i++) {
            logReturns.push(Math.log(prices[i] / prices[i - 1]));
        }

        // Simplified Hurst calculation (R/S analysis)
        const meanLogReturn = Number(mean(logReturns));
        const centeredReturns = logReturns.map(r => r - meanLogReturn);
        
        const cumulativeSum = [0];
        for (let i = 0; i < centeredReturns.length; i++) {
            cumulativeSum.push(cumulativeSum[i] + centeredReturns[i]);
        }

        const range = Math.max(...cumulativeSum) - Math.min(...cumulativeSum);
        const stdev = Number(std(logReturns));

        if (stdev === 0) return 0.5;

        const rs = range / stdev;
        return Math.log(rs) / Math.log(n);
    },

    getRegime: (prices: number[]) => {
        const h = regimeDetector.calculateHurst(prices);
        if (h < 0.45) return 'MEAN_REVERSION';
        if (h > 0.55) return 'MOMENTUM_TREND';
        return 'CHOPPY/NOISE';
    }
};
