import { describe, it, expect } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import { adaptiveDecisionMemoryService, MEMORY_VERSION } from './AdaptiveDecisionMemoryService';
import { AdaptiveDecisionMemoryJsonFileAdapter } from './AdaptiveDecisionMemoryPersistence';

describe('AdaptiveDecisionMemoryService', () => {
    it('records rolling memory and exposes adaptive confidence metrics', () => {
        adaptiveDecisionMemoryService.recordOutcome({
            strategy: 'TREND',
            regime: 'MOMENTUM_TREND',
            executionStyle: 'AGGRESSIVE',
            asset: 'BTC-PERP',
            direction: 'LONG',
            forwardReturn: 0.015,
            implementationShortfall: 0.004,
            slippage: 0.001,
            opportunityCost: 0.0005,
            realizedEdgeDecay: 0.003,
            hit: true,
            timestamp: Date.now()
        });

        const summary = adaptiveDecisionMemoryService.getMemorySummary({
            strategy: 'TREND',
            regime: 'MOMENTUM_TREND',
            executionStyle: 'AGGRESSIVE',
            asset: 'BTC-PERP',
            direction: 'LONG'
        });

        expect(summary.count).toBe(1);
        expect(summary.hitRate).toBeGreaterThan(0.5);
        expect(summary.regimeAdjustedConfidence).toBeGreaterThan(0);
        expect(summary.strategyRegimeEdgeScore).toBeGreaterThan(0);
        expect(summary.executionStyleEffectivenessScore).toBeGreaterThan(0);
    });

    it('exports and imports snapshots with metadata versioning', () => {
        const snapshot = adaptiveDecisionMemoryService.exportSnapshot();
        expect(snapshot.version).toBeDefined();
        expect(snapshot.entries).toBeDefined();
        adaptiveDecisionMemoryService.importSnapshot(snapshot);
        const imported = adaptiveDecisionMemoryService.exportSnapshot();
        expect(imported.version).toBe(snapshot.version);
    });

    it('aggregates rejection reasons and counterfactuals for no-trade intelligence', () => {
        adaptiveDecisionMemoryService.recordNoTradeDecision({
            strategy: 'TREND',
            regime: 'CHOPPY/NOISE',
            executionStyle: 'PASSIVE',
            asset: 'ETH-PERP',
            direction: 'SHORT',
            noTradeReason: 'TAIL_RISK'
        });
        adaptiveDecisionMemoryService.recordCounterfactual({
            strategy: 'TREND',
            regime: 'CHOPPY/NOISE',
            executionStyle: 'PASSIVE',
            asset: 'ETH-PERP',
            direction: 'SHORT',
            noTradeReason: 'TAIL_RISK'
        }, {
            reason: 'TAIL_RISK',
            savedLoss: 0.002,
            blockedEdge: 0.001,
            alphaImpact: 0.001,
            rejectedAt: Date.now()
        });

        const rejection = adaptiveDecisionMemoryService.getRejectionSummary();
        const summary = adaptiveDecisionMemoryService.getMemorySummary({
            strategy: 'TREND',
            regime: 'CHOPPY/NOISE',
            executionStyle: 'PASSIVE',
            asset: 'ETH-PERP',
            direction: 'SHORT'
        });
        expect(rejection.tailRiskRejectionCount).toBeGreaterThan(0);
        expect(rejection.totalRejectedCount).toBeGreaterThan(0);
        expect(summary.blockedAlphaSaved).toBeGreaterThan(0);
    });

    it('persists and loads snapshots through a JSON file adapter safely', async () => {
        const filePath = path.join(process.cwd(), '.tmp', 'adaptive-memory-snapshot.json');
        const adapter = new AdaptiveDecisionMemoryJsonFileAdapter({ filePath });
        const snapshot = adaptiveDecisionMemoryService.exportSnapshot();
        const saved = await adapter.saveSnapshot(snapshot);
        expect(saved).toBe(true);

        const loaded = await adapter.loadSnapshot();
        expect(loaded).not.toBeNull();
        expect(loaded?.version).toBe(MEMORY_VERSION);

        await fs.writeFile(filePath, '{bad json', 'utf8');
        const malformed = await adapter.loadSnapshot();
        expect(malformed).toBeNull();

        await fs.writeFile(filePath, '', 'utf8');
        const empty = await adapter.loadSnapshot();
        expect(empty).toBeNull();
    });
});
