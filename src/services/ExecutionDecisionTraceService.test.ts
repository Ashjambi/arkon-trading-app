import { describe, it, expect } from 'vitest';
import { executionDecisionTraceService } from './ExecutionDecisionTraceService';
import { TradingSignal } from '../types';

describe('ExecutionDecisionTraceService', () => {
    it('should initialize with null snapshot', () => {
        expect(executionDecisionTraceService.getLatestSnapshot()).toBeNull();
    });

    it('should record an allowed path', () => {
        const mockSignal: TradingSignal = {
            id: 'mock-1',
            asset: 'BTC-PERP',
            direction: 'LONG',
            strategy: 'TEST_STRATEGY',
            qualityScore: 95,
            reasoning: 'Test reason',
            metadata: {}
        };

        executionDecisionTraceService.initTrace(mockSignal, true);
        executionDecisionTraceService.recordTradingControl('ACTIVE');
        executionDecisionTraceService.recordPreTrade(true);
        executionDecisionTraceService.recordDispatch();

        const snapshot = executionDecisionTraceService.getLatestSnapshot();
        expect(snapshot).not.toBeNull();
        expect(snapshot?.signal?.asset).toBe('BTC-PERP');
        expect(snapshot?.coordinationUsed).toBe(true);
        expect(snapshot?.tradingControlState).toBe('ACTIVE');
        expect(snapshot?.preTradeDecision?.allowed).toBe(true);
        expect(snapshot?.executionDecision?.dispatched).toBe(true);
    });

    it('should record a blocked pre-trade path', () => {
        const mockSignal: TradingSignal = {
            id: 'mock-2',
            asset: 'ETH-PERP',
            direction: 'SHORT',
            strategy: 'TEST_STRATEGY',
            qualityScore: 80,
            reasoning: 'Test reason',
            metadata: {}
        };

        executionDecisionTraceService.initTrace(mockSignal, false);
        executionDecisionTraceService.recordTradingControl('ACTIVE');
        executionDecisionTraceService.recordPreTrade(false, 'Risk too high', 'R1');
        executionDecisionTraceService.recordBlock('PRE_TRADE', 'Risk too high');

        const snapshot = executionDecisionTraceService.getLatestSnapshot();
        expect(snapshot?.signal?.asset).toBe('ETH-PERP');
        expect(snapshot?.coordinationUsed).toBe(false);
        expect(snapshot?.preTradeDecision?.allowed).toBe(false);
        expect(snapshot?.executionDecision?.dispatched).toBe(false);
        expect(snapshot?.executionDecision?.blockedStage).toBe('PRE_TRADE');
    });

    it('should record a blocked trading control path', () => {
        const mockSignal: TradingSignal = {
            id: 'mock-3',
            asset: 'SOL-PERP',
            direction: 'LONG',
            strategy: 'TEST_STRATEGY',
            qualityScore: 90,
            reasoning: 'Test reason',
            metadata: {}
        };

        executionDecisionTraceService.initTrace(mockSignal, true);
        executionDecisionTraceService.recordTradingControl('BLOCKED');
        executionDecisionTraceService.recordBlock('TRADING_CONTROL', 'Manual block');

        const snapshot = executionDecisionTraceService.getLatestSnapshot();
        expect(snapshot?.signal?.asset).toBe('SOL-PERP');
        expect(snapshot?.tradingControlState).toBe('BLOCKED');
        expect(snapshot?.executionDecision?.dispatched).toBe(false);
        expect(snapshot?.executionDecision?.blockedStage).toBe('TRADING_CONTROL');
    });
});
