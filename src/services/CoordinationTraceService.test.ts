import { describe, it, expect } from 'vitest';
import { coordinationTraceService } from './CoordinationTraceService';
import { TradingSignal } from '../types';

describe('CoordinationTraceService', () => {
    it('should initialize with null snapshot', () => {
        expect(coordinationTraceService.getLatestSnapshot()).toBeNull();
    });

    it('should update and retrieve the latest snapshot', () => {
        const mockSignal: TradingSignal = {
            id: 'mock-1',
            asset: 'BTC-PERP',
            direction: 'LONG',
            strategy: 'TEST_STRATEGY',
            qualityScore: 95,
            reasoning: 'Test reason',
            metadata: {}
        };

        coordinationTraceService.updateSnapshot(
            [mockSignal],
            [{ originalSignal: mockSignal, suppressed: false }],
            { selectedSignals: [{ signal: mockSignal, reason: 'selected' }], rejectedSignals: [] },
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
