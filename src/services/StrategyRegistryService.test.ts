import { describe, it, expect } from 'vitest';
import { strategyRegistryService } from './StrategyRegistryService';

describe('StrategyRegistryService', () => {
    it('1. returns all enabled strategies', () => {
        const enabled = strategyRegistryService.getEnabledStrategies();
        expect(enabled.length).toBeGreaterThan(0);
        // NEWS_SHOCK is disabled in our mock setup
        const disabled = enabled.find(s => s.strategyId === 'NEWS_SHOCK');
        expect(disabled).toBeUndefined();
    });

    it('2. filters strategies by asset', () => {
        const btcStrategies = strategyRegistryService.getStrategiesForAsset('BTC-PERPETUAL');
        expect(btcStrategies.length).toBeGreaterThan(0);
        expect(btcStrategies.some(s => s.strategyId === 'BTC_TREND')).toBe(true);
        expect(btcStrategies.some(s => s.strategyId === 'ETH_TREND')).toBe(false);
    });

    it('3. looks up strategy by ID', () => {
        const meta = strategyRegistryService.getStrategyMeta('COINTEGRATION');
        expect(meta).not.toBeNull();
        expect(meta?.style).toBe('Statistical Arbitrage');
    });

    it('4. includes new stage-2 strategies in registry', () => {
        const meanRev = strategyRegistryService.getStrategyMeta('MEAN_REVERSION_ALPHA');
        const breakout = strategyRegistryService.getStrategyMeta('BREAKOUT_CAPTURE');
        const arb = strategyRegistryService.getStrategyMeta('ARBITRAGE_SCANNER');
        const grid = strategyRegistryService.getStrategyMeta('GRID_TRADING');

        expect(meanRev).not.toBeNull();
        expect(meanRev?.thematicGroup).toBe('Mean Reversion');
        expect(breakout).not.toBeNull();
        expect(arb).not.toBeNull();
        expect(grid).not.toBeNull();
    });

    it('5. returns null for missing strategy', () => {
        const meta = strategyRegistryService.getStrategyMeta('UNKNOWN');
        expect(meta).toBeNull();
    });
});
