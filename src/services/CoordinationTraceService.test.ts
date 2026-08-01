import { describe, it, expect } from 'vitest';
import { coordinationTraceService } from './CoordinationTraceService';
import { TradingSignal, SignalDirection, SignalStrength } from '../types';

describe('CoordinationTraceService', () => {
    it('should initialize with null snapshot', () => {
        expect(coordinationTraceService.getLatestSnapshot()).toBeNull();
    });

    it('should update and retrieve the latest snapshot', () => {
        const mockSignal: TradingSignal = {
            id: 'mock-1',
            timestamp: Date.now(),
            asset: 'BTC-PERP',
            direction: SignalDirection.LONG,
            strategy: 'BTC_TREND',
            qualityScore: 95,
            reasoning: 'Test reason',
            strength: SignalStrength.STRONG,
            entry: 100,
            stopLoss: 90,
            takeProfit: 120,
            tp1: 110,
            tp2: 120,
            details: {} as any,
            metadata: {}
        };

        coordinationTraceService.updateSnapshot(
            [mockSignal],
            [{ originalSignal: mockSignal, suppressed: false, adjustedSizeFactor: 1 }],
            { selectedSignals: [{ signal: mockSignal, selected: true, finalScore: 95, arbitrationNotes: ['selected'] }], suppressedSignals: [] },
            [mockSignal]
        );

        const snapshot = coordinationTraceService.getLatestSnapshot();
        expect(snapshot).not.toBeNull();
        expect(snapshot?.asset).toBe('BTC-PERP');
        expect(snapshot?.inputSignals).toHaveLength(1);
        expect(snapshot?.inputSignals[0].id).toBe('mock-1');
        expect(snapshot?.overlayDecisions).toHaveLength(1);
        expect(snapshot?.arbitrationResult.selectedSignals).toHaveLength(1);
        expect(snapshot?.finalSignals).toHaveLength(1);
        expect(snapshot?.finalSignals[0].id).toBe('mock-1');
    });
});
