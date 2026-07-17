import { strategyArchitect } from './strategyArchitect';
import { riskManagement } from './riskManagement';
import { regimeDetector } from './regimeDetector';
import { strategyPerformanceTracker } from './strategyPerformance';
import { std } from 'mathjs';
import { StrategyPerformance, StrategyType, StrategyGates } from '../types';

// Decision Engine: The "Thinking Engine" that orchestrates strategy and risk
export const decisionEngine = {
    evaluateMarket: (prices: number[], capital: number, correlation: number = 0, strategyPerf: StrategyPerformance, strategyType: StrategyType, gates: StrategyGates, ofiValue: number = 0) => {
        console.log(`[DECISION ENGINE] Starting evaluation. Prices length: ${prices.length}, Capital: ${capital}, Correlation: ${correlation}`);

        // 0. Check if strategy is enabled
        if (!strategyPerformanceTracker.isStrategyEnabled(strategyPerf)) {
            console.log("[DECISION ENGINE] Decision: HOLD - Strategy is disabled due to poor performance.");
            return { action: 'HOLD', size: 0, confidence: 0 };
        }

        // 1. Detect Regime
        const regime = regimeDetector.getRegime(prices);
        console.log(`[DECISION ENGINE] Detected Regime: ${regime}`);

        // 2. Generate Signal (Strategy Architect)
        const action = strategyArchitect.generateSignal(prices, strategyType, gates, ofiValue);
        
        // 3. Strategy Filtering based on Regime
        if (regime === 'MEAN_REVERSION' && action === 'SELL') {
             // Example: Filter out SELL signals in Mean Reversion if regime is strong
        }

        if (action === 'HOLD') {
            console.log("[DECISION ENGINE] Decision: HOLD - No signal.");
            return { action: 'HOLD', size: 0, confidence: 0 };
        }

        // 4. Calculate Volatility (Required for Risk Management)
        const sigma = Number(std(prices));
        console.log(`[DECISION ENGINE] Signal: ${action}, Market Volatility (sigma): ${sigma.toFixed(4)}`);
        
        // 5. Size Position (Risk Management)
        let size = riskManagement.calculateVolatilityAdjustedSize(capital, sigma);
        
        // 6. Apply Correlation Adjustment
        size = riskManagement.calculateCorrelationAdjustment(size, correlation);

        // 7. Return Decision
        const decision = {
            action,
            size: Math.floor(size), // Institutional rounding
            confidence: strategyPerf.successScore / 100 // Use performance score as confidence
        };
        console.log(`[DECISION ENGINE] Final Decision: ${JSON.stringify(decision)}`);
        return decision;
    }
};
