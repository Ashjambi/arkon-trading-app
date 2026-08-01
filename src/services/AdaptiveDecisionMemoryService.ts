import { ExecutionStyle } from './ExecutionStyleService';

export type AdaptiveDecisionMemoryContext = {
    strategy?: string;
    regime?: string;
    executionStyle?: ExecutionStyle | string;
    asset?: string;
    direction?: string;
    noTradeReason?: string;
};

export type AdaptiveDecisionMemoryOutcome = AdaptiveDecisionMemoryContext & {
    realizedPnl?: number | null;
    forwardReturn?: number | null;
    implementationShortfall?: number | null;
    slippage?: number | null;
    opportunityCost?: number | null;
    realizedEdgeDecay?: number | null;
    hit?: boolean | null;
    timestamp?: number;
};

export type AdaptiveDecisionMemoryEntry = {
    key: string;
    strategy: string;
    regime: string;
    executionStyle: string;
    asset: string;
    direction: string;
    count: number;
    hitCount: number;
    hitRate: number;
    avgForwardReturn: number;
    avgImplementationShortfall: number;
    avgSlippage: number;
    avgOpportunityCost: number;
    avgRealizedEdgeDecay: number;
    blockedOpportunityCounts: Record<string, number>;
    lastUpdated: number;
    firstObservedAt: number;
    decayedWeight: number;
    counterfactuals: Array<{
        reason: string;
        rejectedAt: number;
        forwardMove?: number | null;
        realizedMissedOpportunity?: number | null;
        savedLoss?: number | null;
        blockedEdge?: number | null;
        alphaImpact?: number | null;
    }>;
};

export type AdaptiveDecisionMemorySummary = {
    strategy: string;
    regime: string;
    executionStyle: string;
    asset: string;
    direction: string;
    hasHistory: boolean;
    count: number;
    hitRate: number;
    avgForwardReturn: number;
    avgImplementationShortfall: number;
    avgSlippage: number;
    avgOpportunityCost: number;
    avgRealizedEdgeDecay: number;
    blockedOpportunityCounts: Record<string, number>;
    regimeAdjustedConfidence: number;
    strategyRegimeEdgeScore: number;
    executionStyleEffectivenessScore: number;
    blockedOpportunityPenalty: number;
    topRejectedReasons: Array<{ reason: string; count: number }>;
    decayAdjustedStrategyEdge: number;
    blockedAlphaSaved: number;
    blockedAlphaLost: number;
    calibrationDrift: number;
    executionStylePolicyDiagnostics?: Array<{ regime: string; executionStyle: string; effectiveness: number; policy: 'OVER_AGGRESSIVE' | 'UNDER_AGGRESSIVE' | 'BALANCED' }>;
};

export type RejectionCounterSummary = {
    tailRiskRejectionCount: number;
    crowdingRejectionCount: number;
    concentrationRejectionCount: number;
    regimeConflictRejectionCount: number;
    executionRiskRejectionCount: number;
    totalRejectedCount: number;
    topReasons: Array<{ reason: string; count: number }>;
};

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const DEFAULT_HALF_LIFE = 24;
export const MEMORY_VERSION = '1.1';

export type AdaptiveDecisionMemorySnapshot = {
    version: string;
    createdAt: number;
    halfLifeHours: number;
    entries: AdaptiveDecisionMemoryEntry[];
    rejectionCounts: Record<string, number>;
};

function normalizeReason(reason?: string | null): string | null {
    if (!reason) return null;
    const normalized = reason.toLowerCase();
    if (normalized.includes('tail')) return 'TAIL_RISK';
    if (normalized.includes('crowd')) return 'CROWDING';
    if (normalized.includes('concentr')) return 'CONCENTRATION';
    if (normalized.includes('regime conflict')) return 'REGIME_CONFLICT';
    if (normalized.includes('execution risk')) return 'EXECUTION_RISK';
    if (normalized.includes('risk')) return 'EXECUTION_RISK';
    return reason.trim();
}

export class AdaptiveDecisionMemoryService {
    private entries = new Map<string, AdaptiveDecisionMemoryEntry>();
    private rejectionCounts: Record<string, number> = {};
    private maxWindow = 100;
    private halfLifeHours = DEFAULT_HALF_LIFE;
    private metadataVersion = MEMORY_VERSION;

    private buildKey(context: AdaptiveDecisionMemoryContext): string {
        const strategy = (context.strategy || 'UNKNOWN').toString();
        const regime = (context.regime || 'UNKNOWN').toString();
        const executionStyle = (context.executionStyle || 'UNKNOWN').toString();
        const asset = (context.asset || 'UNKNOWN').toString();
        const direction = (context.direction || 'UNKNOWN').toString();
        return `${strategy}|${regime}|${executionStyle}|${asset}|${direction}`;
    }

    private getDefaultEntry(context: AdaptiveDecisionMemoryContext): AdaptiveDecisionMemoryEntry {
        return {
            key: this.buildKey(context),
            strategy: (context.strategy || 'UNKNOWN').toString(),
            regime: (context.regime || 'UNKNOWN').toString(),
            executionStyle: (context.executionStyle || 'UNKNOWN').toString(),
            asset: (context.asset || 'UNKNOWN').toString(),
            direction: (context.direction || 'UNKNOWN').toString(),
            count: 0,
            hitCount: 0,
            hitRate: 0.5,
            avgForwardReturn: 0,
            avgImplementationShortfall: 0,
            avgSlippage: 0,
            avgOpportunityCost: 0,
            avgRealizedEdgeDecay: 0,
            blockedOpportunityCounts: {},
            lastUpdated: Date.now(),
            firstObservedAt: Date.now(),
            decayedWeight: 1,
            counterfactuals: []
        };
    }

    public setHalfLifeHours(halfLifeHours: number): void {
        this.halfLifeHours = Math.max(1, halfLifeHours);
    }

    public exportSnapshot(): AdaptiveDecisionMemorySnapshot {
        this.clearExpiredEntries();
        return {
            version: this.metadataVersion,
            createdAt: Date.now(),
            halfLifeHours: this.halfLifeHours,
            entries: Array.from(this.entries.values()),
            rejectionCounts: { ...this.rejectionCounts }
        };
    }

    public importSnapshot(snapshot: AdaptiveDecisionMemorySnapshot | null): void {
        if (!snapshot) return;
        this.metadataVersion = snapshot.version || this.metadataVersion;
        this.halfLifeHours = snapshot.halfLifeHours || this.halfLifeHours;
        this.entries = new Map((snapshot.entries || []).map(entry => [entry.key, entry]));
        this.rejectionCounts = { ...(snapshot.rejectionCounts || {}) };
        this.clearExpiredEntries();
    }

    public async saveSnapshotToAdapter(adapter: { saveSnapshot(snapshot: AdaptiveDecisionMemorySnapshot): Promise<boolean> | boolean }): Promise<boolean> {
        const snapshot = this.exportSnapshot();
        return await adapter.saveSnapshot(snapshot);
    }

    public async loadSnapshotFromAdapter(adapter: { loadSnapshot(): Promise<AdaptiveDecisionMemorySnapshot | null> | AdaptiveDecisionMemorySnapshot | null }): Promise<AdaptiveDecisionMemorySnapshot | null> {
        const snapshot = await adapter.loadSnapshot();
        if (snapshot) {
            this.importSnapshot(snapshot);
        }
        return snapshot;
    }

    public clearExpiredEntries(now: number = Date.now()): void {
        const cutoff = now - (this.halfLifeHours * 60 * 60 * 1000 * 4);
        for (const [key, entry] of Array.from(this.entries.entries())) {
            if (entry.lastUpdated < cutoff) {
                this.entries.delete(key);
            }
        }
    }

    public recordOutcome(outcome: AdaptiveDecisionMemoryOutcome): AdaptiveDecisionMemorySummary {
        const key = this.buildKey(outcome);
        const existing = this.entries.get(key) || this.getDefaultEntry(outcome);
        const outcomeHit = outcome.hit !== null && outcome.hit !== undefined
            ? Boolean(outcome.hit)
            : (outcome.realizedPnl !== null && outcome.realizedPnl !== undefined ? outcome.realizedPnl > 0 : (outcome.forwardReturn !== null && outcome.forwardReturn !== undefined ? outcome.forwardReturn > 0 : false));

        const observationTime = outcome.timestamp || Date.now();
        const weight = this.computeDecayWeight(observationTime);
        const nextCount = existing.count + 1;
        const hitCount = existing.hitCount + (outcomeHit ? 1 : 0);
        const hitRate = nextCount > 0 ? hitCount / nextCount : 0.5;
        const avgForwardReturn = existing.avgForwardReturn + ((outcome.forwardReturn ?? 0) - existing.avgForwardReturn) / nextCount;
        const avgImplementationShortfall = existing.avgImplementationShortfall + ((outcome.implementationShortfall ?? 0) - existing.avgImplementationShortfall) / nextCount;
        const avgSlippage = existing.avgSlippage + ((outcome.slippage ?? 0) - existing.avgSlippage) / nextCount;
        const avgOpportunityCost = existing.avgOpportunityCost + ((outcome.opportunityCost ?? 0) - existing.avgOpportunityCost) / nextCount;
        const avgRealizedEdgeDecay = existing.avgRealizedEdgeDecay + ((outcome.realizedEdgeDecay ?? 0) - existing.avgRealizedEdgeDecay) / nextCount;

        const updatedEntry: AdaptiveDecisionMemoryEntry = {
            ...existing,
            count: nextCount,
            hitCount,
            hitRate,
            avgForwardReturn,
            avgImplementationShortfall,
            avgSlippage,
            avgOpportunityCost,
            avgRealizedEdgeDecay,
            lastUpdated: observationTime,
            firstObservedAt: existing.firstObservedAt || observationTime,
            decayedWeight: weight,
            counterfactuals: existing.counterfactuals || []
        };

        if (outcome.noTradeReason) {
            const normalized = normalizeReason(outcome.noTradeReason);
            if (normalized) {
                updatedEntry.blockedOpportunityCounts[normalized] = (updatedEntry.blockedOpportunityCounts[normalized] || 0) + 1;
                this.rejectionCounts[normalized] = (this.rejectionCounts[normalized] || 0) + 1;
            }
            this.rejectionCounts[outcome.noTradeReason] = (this.rejectionCounts[outcome.noTradeReason] || 0) + 1;
        }

        this.entries.set(key, updatedEntry);
        if (this.entries.size > this.maxWindow) {
            const oldestKey = this.entries.keys().next().value as string | undefined;
            if (oldestKey) {
                this.entries.delete(oldestKey);
            }
        }

        return this.buildSummary(updatedEntry);
    }

    public getMemorySummary(context: AdaptiveDecisionMemoryContext = {}): AdaptiveDecisionMemorySummary {
        const entry = this.entries.get(this.buildKey(context)) || this.getDefaultEntry(context);
        return this.buildSummary(entry);
    }

    public recordNoTradeDecision(context: AdaptiveDecisionMemoryContext): void {
        const normalized = normalizeReason(context.noTradeReason);
        if (normalized) {
            const entry = this.entries.get(this.buildKey(context)) || this.getDefaultEntry(context);
            entry.blockedOpportunityCounts[normalized] = (entry.blockedOpportunityCounts[normalized] || 0) + 1;
            this.entries.set(this.buildKey(context), entry);
            this.rejectionCounts[normalized] = (this.rejectionCounts[normalized] || 0) + 1;
        }
        if (context.noTradeReason) {
            this.rejectionCounts[context.noTradeReason] = (this.rejectionCounts[context.noTradeReason] || 0) + 1;
        }
    }

    public recordCounterfactual(context: AdaptiveDecisionMemoryContext, outcome: { forwardMove?: number | null; realizedMissedOpportunity?: number | null; savedLoss?: number | null; blockedEdge?: number | null; alphaImpact?: number | null; reason?: string; rejectedAt?: number }): void {
        const normalizedReason = normalizeReason(outcome.reason || context.noTradeReason);
        if (!normalizedReason) return;
        const entry = this.entries.get(this.buildKey(context)) || this.getDefaultEntry(context);
        entry.counterfactuals.push({
            reason: normalizedReason,
            rejectedAt: outcome.rejectedAt || Date.now(),
            forwardMove: outcome.forwardMove ?? null,
            realizedMissedOpportunity: outcome.realizedMissedOpportunity ?? null,
            savedLoss: outcome.savedLoss ?? null,
            blockedEdge: outcome.blockedEdge ?? null,
            alphaImpact: outcome.alphaImpact ?? null
        });
        this.entries.set(this.buildKey(context), entry);
    }

    public getRejectionSummary(): RejectionCounterSummary {
        const tailRiskRejectionCount = this.rejectionCounts['TAIL_RISK'] || 0;
        const crowdingRejectionCount = this.rejectionCounts['CROWDING'] || 0;
        const concentrationRejectionCount = this.rejectionCounts['CONCENTRATION'] || 0;
        const regimeConflictRejectionCount = this.rejectionCounts['REGIME_CONFLICT'] || 0;
        const executionRiskRejectionCount = this.rejectionCounts['EXECUTION_RISK'] || 0;
        const topReasons = Object.entries(this.rejectionCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([reason, count]) => ({ reason, count }));

        return {
            tailRiskRejectionCount,
            crowdingRejectionCount,
            concentrationRejectionCount,
            regimeConflictRejectionCount,
            executionRiskRejectionCount,
            totalRejectedCount: tailRiskRejectionCount + crowdingRejectionCount + concentrationRejectionCount + regimeConflictRejectionCount + executionRiskRejectionCount,
            topReasons
        };
    }

    public buildAttributionSummary(context: AdaptiveDecisionMemoryContext = {}): Record<string, any> {
        const summary = this.getMemorySummary(context);
        const rejectionSummary = this.getRejectionSummary();
        return {
            pnlByStrategyRegime: [{ key: `${summary.strategy}:${summary.regime}`, pnl: summary.decayAdjustedStrategyEdge * 100 }],
            shortfallByStrategyRegimeExecutionStyle: [{ key: `${summary.strategy}:${summary.regime}:${summary.executionStyle}`, shortfall: summary.avgImplementationShortfall }],
            realizedAlphaDecayByRegime: [{ regime: summary.regime, realizedAlphaDecay: summary.avgRealizedEdgeDecay }],
            topRejectionReasons: rejectionSummary.topReasons,
            executionStyleEffectiveness: [{ executionStyle: summary.executionStyle, winRate: summary.hitRate, avgShortfall: summary.avgImplementationShortfall }],
            persistentMemorySummary: {
                hasHistory: summary.hasHistory,
                count: summary.count,
                decayAdjustedStrategyEdge: summary.decayAdjustedStrategyEdge,
                calibrationDrift: summary.calibrationDrift
            }
        };
    }

    private computeDecayWeight(observationTime: number): number {
        const ageHours = Math.max(0, (Date.now() - observationTime) / (1000 * 60 * 60));
        const halfLife = Math.max(1, this.halfLifeHours);
        const decay = Math.pow(0.5, ageHours / halfLife);
        return clamp01(decay);
    }

    private buildSummary(entry: AdaptiveDecisionMemoryEntry): AdaptiveDecisionMemorySummary {
        const rawHitRate = entry.count > 0 ? entry.hitRate : 0.5;
        const weightedForwardReturn = entry.avgForwardReturn * (entry.decayedWeight || 1);
        const weightedShortfall = entry.avgImplementationShortfall * (entry.decayedWeight || 1);
        const weightedSlippage = entry.avgSlippage * (entry.decayedWeight || 1);
        const weightedOpportunityCost = entry.avgOpportunityCost * (entry.decayedWeight || 1);
        const edgeScore = clamp01(0.5 + (rawHitRate - 0.5) * 0.6 + (weightedForwardReturn > 0 ? Math.min(0.2, weightedForwardReturn / 0.02) : -0.05) - Math.min(0.2, weightedShortfall / 0.1) - Math.min(0.1, weightedSlippage / 0.1));
        const regimeAdjustedConfidence = clamp01(0.5 + (rawHitRate - 0.5) * 0.35 + (entry.avgRealizedEdgeDecay > 0 ? 0.05 : 0) - Math.min(0.15, weightedOpportunityCost / 0.05));
        const executionStyleEffectivenessScore = clamp01(0.5 + (rawHitRate - 0.5) * 0.4 - Math.min(0.2, weightedShortfall / 0.05));
        const blockedOpportunityPenalty = clamp01((Object.values(entry.blockedOpportunityCounts).reduce((sum, count) => sum + count, 0) / Math.max(1, entry.count + 1)) * 0.5);
        const topRejectedReasons = Object.entries(entry.blockedOpportunityCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([reason, count]) => ({ reason, count }));
        const blockedAlphaSaved = entry.counterfactuals.reduce((sum, cf) => sum + (cf.savedLoss ?? 0), 0);
        const blockedAlphaLost = entry.counterfactuals.reduce((sum, cf) => sum + (cf.blockedEdge ?? 0), 0);
        const calibrationDrift = clamp01(Math.abs(rawHitRate - 0.5) * 0.5 + Math.min(0.2, weightedShortfall / 0.05));
        const executionStylePolicyDiagnostics = entry.counterfactuals.length > 0 ? [{
            regime: entry.regime,
            executionStyle: entry.executionStyle,
            effectiveness: executionStyleEffectivenessScore,
            policy: (executionStyleEffectivenessScore > 0.7 ? 'BALANCED' : executionStyleEffectivenessScore < 0.35 ? 'OVER_AGGRESSIVE' : 'UNDER_AGGRESSIVE') as 'OVER_AGGRESSIVE' | 'UNDER_AGGRESSIVE' | 'BALANCED'
        }] : undefined;

        return {
            strategy: entry.strategy,
            regime: entry.regime,
            executionStyle: entry.executionStyle,
            asset: entry.asset,
            direction: entry.direction,
            hasHistory: entry.count > 0,
            count: entry.count,
            hitRate: rawHitRate,
            avgForwardReturn: entry.avgForwardReturn,
            avgImplementationShortfall: entry.avgImplementationShortfall,
            avgSlippage: entry.avgSlippage,
            avgOpportunityCost: entry.avgOpportunityCost,
            avgRealizedEdgeDecay: entry.avgRealizedEdgeDecay,
            blockedOpportunityCounts: entry.blockedOpportunityCounts,
            regimeAdjustedConfidence,
            strategyRegimeEdgeScore: edgeScore,
            executionStyleEffectivenessScore,
            blockedOpportunityPenalty,
            topRejectedReasons,
            decayAdjustedStrategyEdge: edgeScore,
            blockedAlphaSaved,
            blockedAlphaLost,
            calibrationDrift,
            executionStylePolicyDiagnostics
        };
    }
}

export const adaptiveDecisionMemoryService = new AdaptiveDecisionMemoryService();
