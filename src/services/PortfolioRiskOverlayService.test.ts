import { describe, it, expect, beforeEach, vi } from 'vitest';
import { portfolioRiskOverlayService } from './PortfolioRiskOverlayService';
import { strategyRegistryService } from './StrategyRegistryService';
import { diagnosticsService } from './DiagnosticsService';
import { TradingSignal } from '../types';

describe('PortfolioRiskOverlayService', () => {
    beforeEach(() => {
        portfolioRiskOverlayService.config = {
            maxConcurrentStrategiesPerAsset: 2,
            maxSimilarThemeSignals: 1,
            maxDirectionalBiasPerAsset: 2
        };
        portfolioRiskOverlayService.strategyWeights = {};
        
        // Setup diagnostics
        (diagnosticsService as any).snapshot.counters.portfolioOverlayAdjustments = 0;
        (diagnosticsService as any).snapshot.counters.suppressedByReason = {};
        (diagnosticsService as any).snapshot.counters.suppressedByStrategy = {};
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

    it('1. No suppression when signals are non-crowded', () => {
        const signals = [
            baseSignal('s1', 'BTC_TREND', 'BTC-PERPETUAL', 'LONG', 80),
            baseSignal('s2', 'ETH_TREND', 'ETH-PERPETUAL', 'SHORT', 70)
        ];

        const decisions = portfolioRiskOverlayService.evaluateSignals(signals);
        
        expect(decisions.length).toBe(2);
        expect(decisions.every(d => !d.suppressed)).toBe(true);
        expect(diagnosticsService.getSnapshot().counters.portfolioOverlayAdjustments).toBe(0);
    });

    it('2. Same-theme duplicates are suppressed (lower priority)', () => {
        // BTC_TREND and BTC_MEAN_REV have different themes (Momentum vs Mean Reversion)
        // But what if we have two Momentum ones?
        // Let's spy on registry to return same theme
        vi.spyOn(strategyRegistryService, 'getStrategyMeta').mockImplementation((strategyId: string) => ({
            strategyId,
            style: 'Trend',
            assetScope: ['BTC-PERPETUAL'],
            enabled: true,
            priorityWeight: 1,
            thematicGroup: 'Momentum'
        }));

        const signals = [
            baseSignal('s1', 'BTC_TREND', 'BTC-PERPETUAL', 'LONG', 90),
            baseSignal('s2', 'BTC_TREND_ALT', 'BTC-PERPETUAL', 'LONG', 70) // Same theme, lower score
        ];

        const decisions = portfolioRiskOverlayService.evaluateSignals(signals);
        
        const accepted = decisions.filter(d => !d.suppressed);
        const suppressed = decisions.filter(d => d.suppressed);

        expect(accepted.length).toBe(1);
        expect(accepted[0].originalSignal.id).toBe('s1');
        
        expect(suppressed.length).toBe(1);
        expect(suppressed[0].suppressionReason).toBe('SUPPRESSED_THEME_DUPLICATION');
        
        expect(diagnosticsService.getSnapshot().counters.portfolioOverlayAdjustments).toBe(1);
        expect(diagnosticsService.getSnapshot().counters.suppressedByReason['SUPPRESSED_THEME_DUPLICATION']).toBe(1);
        
        vi.restoreAllMocks();
    });

    it('3. Lower-priority same-direction signals are suppressed if max concurrent reached', () => {
        vi.spyOn(strategyRegistryService, 'getStrategyMeta').mockImplementation((strategyId: string) => ({
            strategyId,
            style: 'Various',
            assetScope: ['BTC-PERPETUAL'],
            enabled: true,
            priorityWeight: 1,
            thematicGroup: strategyId // distinct themes so they don't fail theme check
        }));

        portfolioRiskOverlayService.config.maxConcurrentStrategiesPerAsset = 2;

        const signals = [
            baseSignal('s1', 'STRAT_A', 'BTC-PERPETUAL', 'LONG', 90),
            baseSignal('s2', 'STRAT_B', 'BTC-PERPETUAL', 'LONG', 80),
            baseSignal('s3', 'STRAT_C', 'BTC-PERPETUAL', 'LONG', 70)
        ];

        const decisions = portfolioRiskOverlayService.evaluateSignals(signals);
        
        const accepted = decisions.filter(d => !d.suppressed);
        const suppressed = decisions.filter(d => d.suppressed);

        expect(accepted.length).toBe(2);
        expect(suppressed.length).toBe(1);
        expect(suppressed[0].suppressionReason).toBe('SUPPRESSED_PORTFOLIO_CROWDING');
        expect(suppressed[0].originalSignal.id).toBe('s3'); // Lowest score
        
        vi.restoreAllMocks();
    });

    it('4. strategyWeights affect adjustedSizeFactor and priority', () => {
        vi.spyOn(strategyRegistryService, 'getStrategyMeta').mockImplementation((strategyId: string) => ({
            strategyId,
            style: 'Various',
            assetScope: ['BTC-PERPETUAL'],
            enabled: true,
            priorityWeight: 1, // Base priority is 1
            thematicGroup: strategyId
        }));

        portfolioRiskOverlayService.config.maxConcurrentStrategiesPerAsset = 1;
        portfolioRiskOverlayService.strategyWeights = {
            'STRAT_A': 0.5,
            'STRAT_B': 2.0
        };

        const signals = [
            baseSignal('s1', 'STRAT_A', 'BTC-PERPETUAL', 'LONG', 80), // Score = 80 * 0.5 = 40
            baseSignal('s2', 'STRAT_B', 'BTC-PERPETUAL', 'LONG', 70)  // Score = 70 * 2.0 = 140
        ];

        const decisions = portfolioRiskOverlayService.evaluateSignals(signals);
        
        const accepted = decisions.find(d => !d.suppressed)!;
        const suppressed = decisions.find(d => d.suppressed)!;

        // STRAT_B should win due to weight, despite lower base quality score
        expect(accepted.originalSignal.strategy).toBe('STRAT_B');
        expect(accepted.adjustedSizeFactor).toBe(2.0); // Reflected weight
        
        expect(suppressed.originalSignal.strategy).toBe('STRAT_A');

        vi.restoreAllMocks();
    });
});
