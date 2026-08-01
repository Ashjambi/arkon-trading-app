export interface TradingDiagnosticsSnapshot {
  timestampUtc: string;
  marketData: {
    btcOrderBookHealthy: boolean;
    ethOrderBookHealthy: boolean;
    btcTradeFlowAvailable: boolean;
    ethTradeFlowAvailable: boolean;
    degradedModeActive: boolean;
  };
  signalFlow: {
    lastSignalAsset: string | null;
    lastSignalDirection: 'LONG' | 'SHORT' | null;
    lastSignalStrategy: string | null;
    lastSignalAccepted: boolean | null;
    lastExecutionMode: 'NORMAL' | 'PASSIVE' | 'PRICE_IMPROVED' | 'DELAYED' | 'SKIP' | null;
    lastRecommendedSize: number | null;
        lastHunterScore?: number | null;
        lastHunterEnabled?: boolean | null;
        lastHunterReasons?: string[];
  };
  counters: {
    preTradeBlockedTotal: number;
    preTradeBlockedByReason: Record<string, number>;
    signalsEvaluated: number;
    signalsAccepted: number;
    signalsRejected: number;
    executionSkipped: number;
    riskExposureBlockedTotal: number;
    riskExposureBlockedByReason: Record<string, number>;
    executionDelayed: number;
    degradedSignals: number;
    portfolioOverlayAdjustments: number;
    suppressedByReason: Record<string, number>;
    suppressedByStrategy: Record<string, number>;
    arbitrationDecisions: number;
    selectedByStrategy: Record<string, number>;
    coordinationRuns: number;
    coordinationInputSignals: number;
    coordinationFinalSignals: number;
        hunterEvaluated: number;
        hunterEnabled: number;
        hunterRejected: number;
        hunterTradesExecuted: number;
        hunterRejectedByReason: Record<string, number>;
  };
}

class DiagnosticsService {
    private snapshot: TradingDiagnosticsSnapshot;

    constructor() {
        this.snapshot = {
            timestampUtc: new Date().toISOString(),
            marketData: {
                btcOrderBookHealthy: false,
                ethOrderBookHealthy: false,
                btcTradeFlowAvailable: false,
                ethTradeFlowAvailable: false,
                degradedModeActive: false,
            },
            signalFlow: {
                lastSignalAsset: null,
                lastSignalDirection: null,
                lastSignalStrategy: null,
                lastSignalAccepted: null,
                lastExecutionMode: null,
                lastRecommendedSize: null,
                lastHunterScore: null,
                lastHunterEnabled: null,
                lastHunterReasons: [],
            },
            counters: {
                preTradeBlockedTotal: 0,
                preTradeBlockedByReason: {},
                signalsEvaluated: 0,
                signalsAccepted: 0,
                signalsRejected: 0,
                executionSkipped: 0,
                riskExposureBlockedTotal: 0,
                riskExposureBlockedByReason: {},
                executionDelayed: 0,
                degradedSignals: 0,
                portfolioOverlayAdjustments: 0,
                suppressedByReason: {},
                suppressedByStrategy: {},
                arbitrationDecisions: 0,
                selectedByStrategy: {},
                coordinationRuns: 0,
                coordinationInputSignals: 0,
                coordinationFinalSignals: 0,
                hunterEvaluated: 0,
                hunterEnabled: 0,
                hunterRejected: 0,
                hunterTradesExecuted: 0,
                hunterRejectedByReason: {},
            }
        };
    }

    private ensureHunterCounters() {
        const counters: any = this.snapshot.counters as any;
        if (typeof counters.hunterEvaluated !== 'number') counters.hunterEvaluated = 0;
        if (typeof counters.hunterEnabled !== 'number') counters.hunterEnabled = 0;
        if (typeof counters.hunterRejected !== 'number') counters.hunterRejected = 0;
        if (typeof counters.hunterTradesExecuted !== 'number') counters.hunterTradesExecuted = 0;
        if (!counters.hunterRejectedByReason) counters.hunterRejectedByReason = {};
        if (!this.snapshot.signalFlow.lastHunterReasons) this.snapshot.signalFlow.lastHunterReasons = [];
        if (this.snapshot.signalFlow.lastHunterScore === undefined) this.snapshot.signalFlow.lastHunterScore = null;
        if (this.snapshot.signalFlow.lastHunterEnabled === undefined) this.snapshot.signalFlow.lastHunterEnabled = null;
    }

    public getSnapshot(): TradingDiagnosticsSnapshot {
        this.ensureHunterCounters();
        this.snapshot.timestampUtc = new Date().toISOString();
        return JSON.parse(JSON.stringify(this.snapshot));
    }

    public recordMarketDataHealth(
        asset: string,
        hasOrderBook: boolean,
        hasTradeFlow: boolean,
        isDegraded: boolean
    ) {
        if (asset.includes('BTC')) {
            this.snapshot.marketData.btcOrderBookHealthy = hasOrderBook;
            this.snapshot.marketData.btcTradeFlowAvailable = hasTradeFlow;
        } else if (asset.includes('ETH')) {
            this.snapshot.marketData.ethOrderBookHealthy = hasOrderBook;
            this.snapshot.marketData.ethTradeFlowAvailable = hasTradeFlow;
        }
        
        // We use OR assignment if multiple assets report degraded, or just set it based on the latest.
        // Usually, set it based on the latest or combine them.
        this.snapshot.marketData.degradedModeActive = isDegraded;
    }

    public recordSignalEvaluated(
        asset: string,
        strategy: string,
        direction: 'LONG' | 'SHORT' | null,
        accepted: boolean,
        isDegraded: boolean
    ) {
        this.snapshot.counters.signalsEvaluated++;
        if (accepted) {
            this.snapshot.counters.signalsAccepted++;
        } else {
            this.snapshot.counters.signalsRejected++;
        }

        if (isDegraded) {
            this.snapshot.counters.degradedSignals++;
        }

        this.snapshot.signalFlow.lastSignalAsset = asset;
        this.snapshot.signalFlow.lastSignalStrategy = strategy;
        this.snapshot.signalFlow.lastSignalDirection = direction;
        this.snapshot.signalFlow.lastSignalAccepted = accepted;
    }

    
    public recordPreTradeBlocked(decisionCode: string, reason: string): void {
        this.snapshot.counters.preTradeBlockedTotal++;
        if (!this.snapshot.counters.preTradeBlockedByReason[decisionCode]) {
            this.snapshot.counters.preTradeBlockedByReason[decisionCode] = 0;
        }
        this.snapshot.counters.preTradeBlockedByReason[decisionCode]++;
    }

    
    public recordExposureBlocked(code: string, reason: string): void {
        this.snapshot.counters.riskExposureBlockedTotal++;
        if (!this.snapshot.counters.riskExposureBlockedByReason[code]) {
            this.snapshot.counters.riskExposureBlockedByReason[code] = 0;
        }
        this.snapshot.counters.riskExposureBlockedByReason[code]++;
    }

    public recordExecutionQuality(
        mode: 'NORMAL' | 'PASSIVE' | 'PRICE_IMPROVED' | 'DELAYED' | 'SKIP',
        recommendedSize: number
    ) {
        this.snapshot.signalFlow.lastExecutionMode = mode;
        this.snapshot.signalFlow.lastRecommendedSize = recommendedSize;

        if (mode === 'SKIP') {
            this.snapshot.counters.executionSkipped++;
        } else if (mode === 'DELAYED') {
            this.snapshot.counters.executionDelayed++;
        }
    }

    public recordOverlayDecision(strategy: string, suppressed: boolean, reason?: string) {
        if (suppressed) {
            this.snapshot.counters.portfolioOverlayAdjustments++;
            if (reason) {
                if (!this.snapshot.counters.suppressedByReason[reason]) {
                    this.snapshot.counters.suppressedByReason[reason] = 0;
                }
                this.snapshot.counters.suppressedByReason[reason]++;
            }
            if (!this.snapshot.counters.suppressedByStrategy[strategy]) {
                this.snapshot.counters.suppressedByStrategy[strategy] = 0;
            }
            this.snapshot.counters.suppressedByStrategy[strategy]++;
        }
    }


    public recordArbitrationDecision(strategy: string, selected: boolean, reason?: string) {
        this.snapshot.counters.arbitrationDecisions++;
        if (selected) {
            if (!this.snapshot.counters.selectedByStrategy[strategy]) {
                this.snapshot.counters.selectedByStrategy[strategy] = 0;
            }
            this.snapshot.counters.selectedByStrategy[strategy]++;
        } else {
            if (reason) {
                if (!this.snapshot.counters.suppressedByReason[reason]) {
                    this.snapshot.counters.suppressedByReason[reason] = 0;
                }
                this.snapshot.counters.suppressedByReason[reason]++;
            }
            if (!this.snapshot.counters.suppressedByStrategy[strategy]) {
                this.snapshot.counters.suppressedByStrategy[strategy] = 0;
            }
            this.snapshot.counters.suppressedByStrategy[strategy]++;
        }
    }

    public recordCoordinationRun(inputCount: number, finalCount: number) {
        this.snapshot.counters.coordinationRuns++;
        this.snapshot.counters.coordinationInputSignals += inputCount;
        this.snapshot.counters.coordinationFinalSignals += finalCount;
    }

    public recordHunterDecision(enabled: boolean, score: number, reasons: string[], blockers: string[]) {
        this.ensureHunterCounters();
        this.snapshot.counters.hunterEvaluated++;
        this.snapshot.signalFlow.lastHunterScore = score;
        this.snapshot.signalFlow.lastHunterEnabled = enabled;
        this.snapshot.signalFlow.lastHunterReasons = [...(enabled ? reasons : blockers)].slice(0, 6);

        if (enabled) {
            this.snapshot.counters.hunterEnabled++;
        } else {
            this.snapshot.counters.hunterRejected++;
            for (const blocker of blockers) {
                if (!this.snapshot.counters.hunterRejectedByReason[blocker]) {
                    this.snapshot.counters.hunterRejectedByReason[blocker] = 0;
                }
                this.snapshot.counters.hunterRejectedByReason[blocker]++;
            }
        }
    }

    public recordHunterTradeExecuted() {
        this.ensureHunterCounters();
        this.snapshot.counters.hunterTradesExecuted++;
    }
}
export const diagnosticsService = new DiagnosticsService();

    