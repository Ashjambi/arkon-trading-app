import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuditLogger, TradeDecision } from './AuditTrailService';

const buildDecision = (overrides: Partial<TradeDecision> = {}): TradeDecision => ({
    timestamp: Date.now(),
    signal: 'BUY',
    action: 'BOOST',
    reasoning: 'Unit test decision',
    marketConditions: {
        volatility: 1.2,
        trendStrength: 0.7,
        volumeProfile: 1.1,
    },
    riskMetrics: {
        maxDrawdown: 2,
        exposureRatio: 0.5,
    },
    metadata: {
        actionType: 'ENTRY',
        asset: 'BTC-PERP',
        strategy: 'TEST',
        decisionStage: 'POST_EXECUTION',
        severity: 'INFO',
    },
    ...overrides,
});

describe('AuditTrailService', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('logs decision into in-memory database', async () => {
        const logger = new AuditLogger();
        await logger.logDecision(buildDecision());

        const recent = logger.getRecent(10);
        expect(recent.length).toBe(1);
        expect(recent[0].action).toBe('BOOST');
    });

    it('sends critical notification for critical decision', async () => {
        const logger = new AuditLogger();
        const criticalNotifier = vi.fn().mockResolvedValue(undefined);

        await logger.logDecision(
            buildDecision({
                action: 'FLIP',
                riskMetrics: { maxDrawdown: 9, exposureRatio: 0.97 },
                metadata: { severity: 'CRITICAL' },
            } as any),
            { criticalNotifier }
        );

        expect(criticalNotifier).toHaveBeenCalledTimes(1);
    });

    it('calls remote file endpoint when webhookUrl is provided', async () => {
        const logger = new AuditLogger();
        const fetchMock = vi.spyOn(globalThis, 'fetch' as any).mockResolvedValue({ ok: true, status: 200 } as any);

        await logger.logDecision(buildDecision(), { webhookUrl: 'http://127.0.0.1:3000' });

        expect(fetchMock).toHaveBeenCalledTimes(1);
        const firstCall = fetchMock.mock.calls[0];
        expect(firstCall[0]).toContain('/api/diagnostics/audit-trail');
    });
});
