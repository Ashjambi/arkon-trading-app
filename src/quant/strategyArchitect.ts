import { mean, std } from 'mathjs';
import { StrategyType, StrategyGates } from '../types';
import { regimeDetector } from './regimeDetector';

// Strategy Architect: Designs institutional trading strategies
export const strategyArchitect = {
    generateSignal: (prices: number[], strategyType: StrategyType, gates: StrategyGates, ofiValue: number = 0) => {
        if (prices.length < 50) return 'HOLD';

        if (strategyType.includes('MEAN_REV')) {
            return strategyArchitect.generateMeanReversionSignal(prices, gates);
        } else if (strategyType.includes('TREND_FOLLOWING')) {
            return strategyArchitect.generateTrendFollowingSignal(prices, gates, ofiValue);
        }
        
        return 'HOLD';
    },

    // Signal generation using Statistical Mean Reversion
    generateMeanReversionSignal: (prices: number[], gates: StrategyGates) => {
        const currentPrice = prices[prices.length - 1];
        const mu = Number(mean(prices));
        const sigma = Number(std(prices));
        const hurst = regimeDetector.calculateHurst(prices);

        if (sigma === 0) return 'HOLD';

        const zScore = (currentPrice - mu) / sigma;

        // Only enter mean reversion if the regime is mean-reverting (Hurst < 0.5)
        // and price is statistically extreme
        if (zScore < -gates.vwapZScore && hurst < 0.45) return 'BUY';
        if (zScore > gates.vwapZScore && hurst < 0.45) return 'SELL';
        
        return 'HOLD';
    },

    // Signal generation using Momentum-based Trend Following (Pure Quant)
    generateTrendFollowingSignal: (prices: number[], gates: StrategyGates, ofiValue: number) => {
        // Use statistical momentum: Z-score of recent returns
        const returns = prices.slice(1).map((p, i) => Math.log(p / prices[i]));
        const recentMomentum = Number(mean(returns.slice(-20)));
        const vol = Number(std(returns.slice(-20)));
        
        if (vol === 0) return 'HOLD';
        
        const momentumZScore = recentMomentum / vol;
        
        // Calculate Hurst for trend strength filter
        const hurst = regimeDetector.calculateHurst(prices);

        // Use statistical momentum + Hurst + OFI
        if (momentumZScore > 0.5 && hurst > gates.hurst && ofiValue > gates.ofi) return 'BUY';
        if (momentumZScore < -0.5 && hurst > gates.hurst && ofiValue < -gates.ofi) return 'SELL';
        
        return 'HOLD';
    }
};
