import { describe, it, expect, beforeEach } from 'vitest';
import { diagnosticsService, TradingDiagnosticsSnapshot } from './DiagnosticsService';

describe('DiagnosticsService', () => {
    beforeEach(() => {
        // Reset singleton for testing by forcing a new snapshot
        (diagnosticsService as any).snapshot = {
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
            },
            counters: {
                signalsEvaluated: 0,
                signalsAccepted: 0,
                signalsRejected: 0,
                executionSkipped: 0,
                executionDelayed: 0,
                degradedSignals: 0,
            }
        };
    });

    it('1. should increment signal counters correctly', () => {
        diagnosticsService.recordSignalEvaluated('BTC-PERPETUAL', 'STRAT_1', 'LONG', true, false);
        diagnosticsService.recordSignalEvaluated('ETH-PERPETUAL', 'STRAT_2', 'SHORT', false, false);
        
        const snap = diagnosticsService.getSnapshot();
        expect(snap.counters.signalsEvaluated).toBe(2);
        expect(snap.counters.signalsAccepted).toBe(1);
        expect(snap.counters.signalsRejected).toBe(1);
    });

    it('2. should update last snapshot info correctly', () => {
        diagnosticsService.recordSignalEvaluated('BTC-PERPETUAL', 'MOMENTUM', 'LONG', true, false);
        
        const snap = diagnosticsService.getSnapshot();
        expect(snap.signalFlow.lastSignalAsset).toBe('BTC-PERPETUAL');
        expect(snap.signalFlow.lastSignalStrategy).toBe('MOMENTUM');
        expect(snap.signalFlow.lastSignalDirection).toBe('LONG');
        expect(snap.signalFlow.lastSignalAccepted).toBe(true);
    });

    it('3. degraded flags turn on when expected', () => {
        diagnosticsService.recordMarketDataHealth('BTC-PERPETUAL', false, false, true);
        
        const snap = diagnosticsService.getSnapshot();
        expect(snap.marketData.btcOrderBookHealthy).toBe(false);
        expect(snap.marketData.btcTradeFlowAvailable).toBe(false);
        expect(snap.marketData.degradedModeActive).toBe(true);
    });

    it('4. execution skip count increments on shouldSkip', () => {
        diagnosticsService.recordExecutionQuality('SKIP', 0.1);
        diagnosticsService.recordExecutionQuality('DELAYED', 0.1);
        diagnosticsService.recordExecutionQuality('NORMAL', 0.5);

        const snap = diagnosticsService.getSnapshot();
        expect(snap.counters.executionSkipped).toBe(1);
        expect(snap.counters.executionDelayed).toBe(1);
        expect(snap.signalFlow.lastExecutionMode).toBe('NORMAL');
    });

    it('5. service remains null-safe', () => {
        diagnosticsService.recordSignalEvaluated('BTC-PERPETUAL', 'NONE', null, false, false);
        const snap = diagnosticsService.getSnapshot();
        expect(snap.signalFlow.lastSignalDirection).toBe(null);
    });

    it('6. getter returns a stable snapshot object', () => {
        const snap1 = diagnosticsService.getSnapshot();
        const snap2 = diagnosticsService.getSnapshot();
        
        expect(snap1).not.toBe(snap2); // Different instances
        expect(snap1.timestampUtc).toBeDefined();
    });
});
