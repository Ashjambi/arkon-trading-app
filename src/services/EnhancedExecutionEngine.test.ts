import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EnhancedExecutionEngine } from './EnhancedExecutionEngine';

describe('EnhancedExecutionEngine', () => {
    const engine = new EnhancedExecutionEngine();
    const now = new Date('2026-07-20T12:00:00.000Z').getTime();

    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(now);
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('returns HOLD when cooldown is still active', () => {
        const decision = engine.decideAction(
            {
                direction: 'LONG',
                volume: 1,
                strength: 70,
                openTime: now - 60 * 1000,
            },
            {
                direction: 'SHORT',
                strength: 95,
                volume: 2,
                confidence: 90,
                timestamp: now,
            },
            {
                volatility: 1,
                trendStrength: 0.8,
                volumeProfile: 70,
            }
        );

        expect(decision.action).toBe('HOLD');
        expect(decision.reason).toBe('COOLDOWN_ACTIVE');
    });

    it('returns FLIP on strong reversal conditions', () => {
        const decision = engine.decideAction(
            {
                direction: 'LONG',
                volume: 1,
                strength: 60,
                openTime: now - 45 * 60 * 1000,
            },
            {
                direction: 'SHORT',
                strength: 90,
                volume: 1.6,
                confidence: 85,
                timestamp: now,
            },
            {
                volatility: 1.2,
                trendStrength: 0.6,
                volumeProfile: 65,
            }
        );

        expect(decision.action).toBe('FLIP');
        expect(decision.closeOpposite).toBe(true);
        expect(decision.reason).toBe('STRONG_REVERSAL_SIGNAL');
        expect((decision.size || 0)).toBeGreaterThan(0);
    });

    it('returns HEDGE for weak confidence reversal', () => {
        const decision = engine.decideAction(
            {
                direction: 'LONG',
                volume: 1,
                strength: 85,
                openTime: now - 45 * 60 * 1000,
            },
            {
                direction: 'SHORT',
                strength: 80,
                volume: 0.9,
                confidence: 55,
                timestamp: now,
            },
            {
                volatility: 2,
                trendStrength: 0.5,
                volumeProfile: 40,
            }
        );

        expect(decision.action).toBe('HEDGE');
        expect(decision.closeOpposite).toBe(false);
        expect(decision.reason).toBe('DEFENSIVE_HEDGE');
        expect((decision.size || 0)).toBeGreaterThan(0);
    });

    it('returns BOOST on strong same-direction momentum', () => {
        const decision = engine.decideAction(
            {
                direction: 'LONG',
                volume: 1,
                strength: 70,
                openTime: now - 45 * 60 * 1000,
            },
            {
                direction: 'LONG',
                strength: 95,
                volume: 1.8,
                confidence: 88,
                timestamp: now,
            },
            {
                volatility: 1.1,
                trendStrength: 0.9,
                volumeProfile: 90,
                reversalProbability: 10,
                currentBoostCount: 1,
            }
        );

        expect(decision.action).toBe('BOOST');
        expect(decision.reason).toBe('MOMENTUM_BOOST');
        expect(decision.maxBoosts).toBe(3);
    });

    it('returns HOLD when max boosts is reached', () => {
        const decision = engine.decideAction(
            {
                direction: 'LONG',
                volume: 1,
                strength: 70,
                openTime: now - 45 * 60 * 1000,
            },
            {
                direction: 'LONG',
                strength: 98,
                volume: 2,
                confidence: 90,
                timestamp: now,
            },
            {
                volatility: 1,
                trendStrength: 0.95,
                volumeProfile: 95,
                reversalProbability: 5,
                currentBoostCount: 3,
                maxBoosts: 3,
            }
        );

        expect(decision.action).toBe('HOLD');
        expect(decision.reason).toBe('MAX_BOOSTS_REACHED');
    });
});
