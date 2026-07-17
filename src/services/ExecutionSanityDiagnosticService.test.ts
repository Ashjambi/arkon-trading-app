import { describe, it, expect, beforeEach, vi } from 'vitest';
import { executionSanityDiagnosticService } from './ExecutionSanityDiagnosticService';

describe('ExecutionSanityDiagnosticService', () => {
    beforeEach(() => {
        executionSanityDiagnosticService.reset();
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-07-16T12:00:00Z'));
    });

    it('Scenario: Returns empty report when no traces', () => {
        const report = executionSanityDiagnosticService.generateDiagnosticReport();
        expect(report.totalOpportunities).toBe(0);
        expect(report.approvedCount).toBe(0);
        expect(report.rejectedCount).toBe(0);
    });

    it('Scenario: Tracks approved signals', () => {
        executionSanityDiagnosticService.recordTrace({
            createdAt: new Date('2026-07-16T11:00:00Z').toISOString(),
            signal: { asset: 'BTC', strategy: 'TREND' } as any,
            coordinationUsed: false,
            executionDecision: { attempted: true, dispatched: true }
        });

        const report = executionSanityDiagnosticService.generateDiagnosticReport();
        expect(report.totalOpportunities).toBe(1);
        expect(report.approvedCount).toBe(1);
        expect(report.rejectedCount).toBe(0);
    });

    it('Scenario: Tracks rejected signals with reason and stage', () => {
        executionSanityDiagnosticService.recordTrace({
            createdAt: new Date('2026-07-16T11:00:00Z').toISOString(),
            signal: { asset: 'BTC', strategy: 'TREND' } as any,
            coordinationUsed: false,
            preTradeDecision: { allowed: false, code: 'MAX_LOSS', reason: 'Hit max loss' },
            executionDecision: { attempted: true, dispatched: false, blockedStage: 'PRE_TRADE', reason: 'Hit max loss' }
        });

        const report = executionSanityDiagnosticService.generateDiagnosticReport();
        expect(report.totalOpportunities).toBe(1);
        expect(report.approvedCount).toBe(0);
        expect(report.rejectedCount).toBe(1);
        expect(report.rejectionByStage['PRE_TRADE']).toBe(1);
        expect(report.recentRejections[0].reasonCode).toBe('MAX_LOSS');
        expect(report.recentRejections[0].reason).toBe('Hit max loss');
    });

    it('Scenario: Ignores traces outside the window', () => {
        // Outside 24h
        executionSanityDiagnosticService.recordTrace({
            createdAt: new Date('2026-07-14T11:00:00Z').toISOString(),
            signal: { asset: 'BTC', strategy: 'TREND' } as any,
            coordinationUsed: false,
            executionDecision: { attempted: true, dispatched: true }
        });

        const report = executionSanityDiagnosticService.generateDiagnosticReport(24 * 60 * 60 * 1000);
        expect(report.totalOpportunities).toBe(0);
    });
});
