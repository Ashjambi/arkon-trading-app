import { describe, it, expect, beforeEach, vi } from 'vitest';
import { multiStrategySignalCoordinatorService } from './MultiStrategySignalCoordinatorService';
import { portfolioRiskOverlayService } from './PortfolioRiskOverlayService';
import { strategyArbitrationService } from './StrategyArbitrationService';
import { diagnosticsService } from './DiagnosticsService';
import { TradingSignal } from '../types';
import { strategyRegistryService } from './StrategyRegistryService';

describe('MultiStrategySignalCoordinatorService', () => {
    beforeEach(() => {
        // Reset counters
        (diagnosticsService as any).snapshot.counters.coordinationRuns = 0;
        (diagnosticsService as any).snapshot.counters.coordinationInputSignals = 0;
        (diagnosticsService as any).snapshot.counters.coordinationFinalSignals = 0;
        (diagnosticsService as any).snapshot.counters.portfolioOverlayAdjustments = 0;
        (diagnosticsService as any).snapshot.counters.arbitrationDecisions = 0;

        portfolioRiskOverlayService.config = {
            maxSimilarThemeSignals: 2,
            maxDirectionalBiasPerAsset: 2,
            maxConcurrentStrategiesPerAsset: 2,
            // strategyWeights: {}
        };

        strategyArbitrationService.config = {
            maxSameDirectionSignalsPerAsset: 1,
            minQualityScore: 0 // allow all for simplicity in test
        };
    });

    const baseSignal = (id: string, strategy: string, asset: string, direction: 'LONG' | 'SHORT', qualityScore: number): TradingSignal => ({
        id,
        timestamp: Date.now(),
        asset,
        direction: direction as any,
        strength: 50 as any,
        entry: 100,
        stopLoss: 90,
        takeProfit: 120,
        tp1: 110,
        tp2: 120,
        qualityScore,
        reasoning: '',
        strategy: strategy as any,
        details: {} as any
    });

    it('1. Coordinates end-to-end preserving valid signals', () => {
        vi.spyOn(strategyRegistryService, 'getStrategyMeta').mockImplementation((strategyId: string) => ({
            strategyId,
            style: 'Trend',
            assetScope: ['BTC-PERPETUAL', 'ETH-PERPETUAL'],
            enabled: true,
            priorityWeight: 1,
            thematicGroup: 'Momentum'
        }));

        const signals = [
            baseSignal('s1', 'BTC_TREND', 'BTC-PERPETUAL', 'LONG', 80),
            baseSignal('s2', 'ETH_TREND', 'ETH-PERPETUAL', 'SHORT', 70)
        ];

        const result = multiStrategySignalCoordinatorService.coordinate(signals);
        
        expect(result.inputSignals.length).toBe(2);
        expect(result.overlayDecisions.length).toBe(2);
        expect(result.overlayDecisions.some(d => d.suppressed)).toBe(false);
        expect(result.finalSignals.length).toBe(2);
        
        expect(diagnosticsService.getSnapshot().counters.coordinationRuns).toBe(1);
        expect(diagnosticsService.getSnapshot().counters.coordinationInputSignals).toBe(2);
        expect(diagnosticsService.getSnapshot().counters.coordinationFinalSignals).toBe(2);
        
        vi.restoreAllMocks();
    });

    it('2. Overlay-suppressed signals never reach arbitration', () => {
        vi.spyOn(strategyRegistryService, 'getStrategyMeta').mockImplementation((strategyId: string) => ({
            strategyId,
            style: 'Trend',
            assetScope: ['BTC-PERPETUAL'],
            enabled: true,
            priorityWeight: 1,
            thematicGroup: strategyId === 'STRAT_A' ? 'ThemeA' : 'ThemeB'
        }));

        portfolioRiskOverlayService.config.maxConcurrentStrategiesPerAsset = 1;

        const signals = [
            baseSignal('s1', 'STRAT_A', 'BTC-PERPETUAL', 'LONG', 80),
            baseSignal('s2', 'STRAT_B', 'BTC-PERPETUAL', 'SHORT', 90)
        ];

        const result = multiStrategySignalCoordinatorService.coordinate(signals);
        
        expect(result.inputSignals.length).toBe(2);
        expect(result.overlayDecisions.filter(d => d.suppressed).length).toBe(1); // max 1 per asset => second suppressed
        
        // Arbitration only gets 1 signal
        expect(result.arbitrationResult.selectedSignals.length).toBe(1);
        expect(result.arbitrationResult.suppressedSignals.length).toBe(0);
        
        expect(result.finalSignals.length).toBe(1);
        expect(result.finalSignals[0].id).toBe('s2'); // s2 got accepted by overlay

        vi.restoreAllMocks();
    });

    it('3. Arbitration-suppressed signals never reach finalSignals', () => {
        vi.spyOn(strategyRegistryService, 'getStrategyMeta').mockImplementation((strategyId: string) => ({
            strategyId,
            style: 'Trend',
            assetScope: ['BTC-PERPETUAL'],
            enabled: true,
            priorityWeight: 1,
            thematicGroup: strategyId === 'STRAT_A' ? 'ThemeA' : 'ThemeB'
        }));

        portfolioRiskOverlayService.config.maxConcurrentStrategiesPerAsset = 5;
        strategyArbitrationService.config.maxSameDirectionSignalsPerAsset = 1; // strict arbitration

        const signals = [
            baseSignal('s1', 'STRAT_A', 'BTC-PERPETUAL', 'LONG', 80),
            baseSignal('s2', 'STRAT_B', 'BTC-PERPETUAL', 'LONG', 70)
        ];

        const result = multiStrategySignalCoordinatorService.coordinate(signals);
        
        // Both pass overlay
        expect(result.overlayDecisions.filter(d => d.suppressed).length).toBe(0);
        
        // Arbitration suppresses one
        expect(result.arbitrationResult.selectedSignals.length).toBe(1);
        expect(result.arbitrationResult.suppressedSignals.length).toBe(1);
        
        // Final signals should match selected
        expect(result.finalSignals.length).toBe(1);
        expect(result.finalSignals[0].id).toBe('s1');

        vi.restoreAllMocks();
    });
});
