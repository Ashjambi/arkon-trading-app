import { describe, it, expect } from 'vitest';
import { executionDecisionTraceService } from './ExecutionDecisionTraceService';
import { TradingSignal, SignalDirection, SignalStrength } from '../types';

describe('ExecutionDecisionTraceService', () => {
    it('should initialize with null snapshot', () => {
        expect(executionDecisionTraceService.getLatestSnapshot()).toBeNull();
    });

    it('should record an allowed path', () => {
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
            timestamp: Date.now(),
            asset: 'ETH-PERP',
            direction: SignalDirection.SHORT,
            strategy: 'BTC_TREND',
            qualityScore: 80,
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
            timestamp: Date.now(),
            asset: 'SOL-PERP',
            direction: SignalDirection.LONG,
            strategy: 'BTC_TREND',
            qualityScore: 90,
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

        executionDecisionTraceService.initTrace(mockSignal, true);
        executionDecisionTraceService.recordTradingControl('BLOCKED');
        executionDecisionTraceService.recordBlock('TRADING_CONTROL', 'Manual block');

        const snapshot = executionDecisionTraceService.getLatestSnapshot();
        expect(snapshot?.signal?.asset).toBe('SOL-PERP');
        expect(snapshot?.tradingControlState).toBe('BLOCKED');
        expect(snapshot?.executionDecision?.dispatched).toBe(false);
        expect(snapshot?.executionDecision?.blockedStage).toBe('TRADING_CONTROL');
    });

    it('should attach hunter mode decision to trace', () => {
        const mockSignal: TradingSignal = {
            id: 'mock-4',
            timestamp: Date.now(),
            asset: 'BTC-PERP',
            direction: SignalDirection.LONG,
            strategy: 'BTC_TREND',
            qualityScore: 99,
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

        executionDecisionTraceService.initTrace(mockSignal, true);
        executionDecisionTraceService.recordHunterMode({
            enabled: true,
            score: 92,
            reasons: ['signal=99'],
            blockers: [],
            modifiers: { sizeMultiplier: 1.25 }
        });

        const snapshot = executionDecisionTraceService.getLatestSnapshot();
        expect(snapshot?.executionDecision?.hunterMode?.enabled).toBe(true);
        expect(snapshot?.executionDecision?.hunterMode?.score).toBe(92);
    });
});
