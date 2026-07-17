import { describe, it, expect, beforeEach, vi } from 'vitest';
import { strategyArbitrationService } from './StrategyArbitrationService';
import { strategyRegistryService } from './StrategyRegistryService';
import { diagnosticsService } from './DiagnosticsService';
import { TradingSignal } from '../types';

describe('StrategyArbitrationService', () => {
    beforeEach(() => {
        strategyArbitrationService.config = {
            maxSameDirectionSignalsPerAsset: 1,
            minQualityScore: 30
        };
        
        // Setup diagnostics
        (diagnosticsService as any).snapshot.counters.arbitrationDecisions = 0;
        (diagnosticsService as any).snapshot.counters.suppressedByReason = {};
        (diagnosticsService as any).snapshot.counters.suppressedByStrategy = {};
        (diagnosticsService as any).snapshot.counters.selectedByStrategy = {};
    });

    const baseSignal = (id: string, strategy: string, asset: string, direction: 'LONG' as any | 'SHORT', qualityScore: number): TradingSignal => ({
        id,
        timestamp: Date.now(),
        asset,
        direction,
        strength: 50,
        entry: 100,
        stopLoss: 90,
        takeProfit: 120,
        tp1: 110,
        tp2: 120,
        qualityScore,
        reasoning: '',
        strategy: strategy as any
    });

    it('1. Conflicting opposite-direction same-asset signals => stronger one selected', () => {
        vi.spyOn(strategyRegistryService, 'getStrategyMeta').mockImplementation((strategyId: string) => ({
            strategyId,
            style: 'Trend',
            assetScope: ['BTC-PERPETUAL'],
            enabled: true,
            priorityWeight: 1,
            thematicGroup: 'Momentum'
        }));

        const signals = [
            baseSignal('s1', 'BTC_TREND', 'BTC-PERPETUAL', 'LONG', 80),
            baseSignal('s2', 'BTC_MEAN_REV', 'BTC-PERPETUAL', 'SHORT', 70) // Weaker score
        ];

        const result = strategyArbitrationService.arbitrate(signals);
        
        expect(result.selectedSignals.length).toBe(1);
        expect(result.selectedSignals[0].signal.id).toBe('s1');
        
        expect(result.suppressedSignals.length).toBe(1);
        expect(result.suppressedSignals[0].signal.id).toBe('s2');
        expect(result.suppressedSignals[0].suppressionReason).toBe('SUPPRESSED_CONFLICTING_SIGNAL');
        
        expect(diagnosticsService.getSnapshot().counters.arbitrationDecisions).toBe(2);
        expect(diagnosticsService.getSnapshot().counters.suppressedByReason['SUPPRESSED_CONFLICTING_SIGNAL']).toBe(1);
        
        vi.restoreAllMocks();
    });

    it('2. Same-direction crowded same-asset signals => only highest-ranked survive', () => {
        vi.spyOn(strategyRegistryService, 'getStrategyMeta').mockImplementation((strategyId: string) => ({
            strategyId,
            style: 'Trend',
            assetScope: ['ETH-PERPETUAL'],
            enabled: true,
            priorityWeight: 1,
            thematicGroup: 'Momentum'
        }));

        const signals = [
            baseSignal('s1', 'ETH_TREND', 'ETH-PERPETUAL', 'LONG', 80),
            baseSignal('s2', 'ETH_SCALPER', 'ETH-PERPETUAL', 'LONG', 90) // Stronger score
        ];

        const result = strategyArbitrationService.arbitrate(signals);
        
        expect(result.selectedSignals.length).toBe(1);
        expect(result.selectedSignals[0].signal.id).toBe('s2');
        
        expect(result.suppressedSignals.length).toBe(1);
        expect(result.suppressedSignals[0].signal.id).toBe('s1');
        expect(result.suppressedSignals[0].suppressionReason).toBe('SUPPRESSED_LOW_PRIORITY');
        
        vi.restoreAllMocks();
    });

    it('3. Different-asset signals => all preserved', () => {
        const signals = [
            baseSignal('s1', 'BTC_TREND', 'BTC-PERPETUAL', 'LONG', 80),
            baseSignal('s2', 'ETH_TREND', 'ETH-PERPETUAL', 'SHORT', 70)
        ];

        const result = strategyArbitrationService.arbitrate(signals);
        
        expect(result.selectedSignals.length).toBe(2);
        expect(result.suppressedSignals.length).toBe(0);
    });

    it('4. Priority/quality affects finalScore and selection', () => {
        vi.spyOn(strategyRegistryService, 'getStrategyMeta').mockImplementation((strategyId: string) => ({
            strategyId,
            style: 'Various',
            assetScope: ['BTC-PERPETUAL'],
            enabled: true,
            priorityWeight: strategyId === 'STRAT_B' ? 2.0 : 1.0, // STRAT_B has higher weight
            thematicGroup: 'Various'
        }));

        const signals = [
            baseSignal('s1', 'STRAT_A', 'BTC-PERPETUAL', 'LONG', 80), // finalScore ~ 80 * 1 = 80
            baseSignal('s2', 'STRAT_B', 'BTC-PERPETUAL', 'LONG', 70)  // finalScore ~ 70 * 2 = 140
        ];

        const result = strategyArbitrationService.arbitrate(signals);
        
        expect(result.selectedSignals.length).toBe(1);
        expect(result.selectedSignals[0].signal.strategy).toBe('STRAT_B');
        
        expect(result.suppressedSignals.length).toBe(1);
        expect(result.suppressedSignals[0].signal.strategy).toBe('STRAT_A');

        vi.restoreAllMocks();
    });
});
