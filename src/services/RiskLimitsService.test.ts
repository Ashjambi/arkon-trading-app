import { describe, it, expect, beforeEach } from 'vitest';
import { riskLimitsService } from './RiskLimitsService';

describe('RiskLimitsService', () => {
    beforeEach(() => {
        // Since resetDaily doesn't reset exposure, we manually reset the singleton for tests by replacing snapshot
        const initial = (riskLimitsService as any).getInitialSnapshot();
        (riskLimitsService as any).snapshot = initial;
    });

    it('1. allows valid entry', () => {
        const result = riskLimitsService.isEntryAllowed('BTC-PERPETUAL', 50000, 1);
        expect(result.allowed).toBe(true);
    });

    it('2. blocks entry breaching maxPositionSize', () => {
        const result = riskLimitsService.isEntryAllowed('BTC-PERPETUAL', 500000, 11);
        expect(result.allowed).toBe(false);
        expect(result.code).toBe('BLOCKED_EXPOSURE');
        expect(result.reason).toContain('Max position size exceeded');
    });

    it('3. blocks entry breaching maxNotionalExposure', () => {
        const result = riskLimitsService.isEntryAllowed('BTC-PERPETUAL', 1100000, 1);
        expect(result.allowed).toBe(false);
        expect(result.code).toBe('BLOCKED_EXPOSURE');
        expect(result.reason).toContain('Max notional exposure exceeded');
    });

    it('4. blocks entry breaching global maxOpenPositions', () => {
        riskLimitsService.registerExecutedOrder('ASSET1', 'LONG', 1, 1000, false);
        riskLimitsService.registerExecutedOrder('ASSET2', 'LONG', 1, 1000, false);
        riskLimitsService.registerExecutedOrder('ASSET3', 'LONG', 1, 1000, false);
        riskLimitsService.registerExecutedOrder('ASSET4', 'LONG', 1, 1000, false);
        riskLimitsService.registerExecutedOrder('ASSET5', 'LONG', 1, 1000, false);
        
        // Next different asset should fail
        const result = riskLimitsService.isEntryAllowed('ASSET6', 1000, 1);
        expect(result.allowed).toBe(false);
        expect(result.code).toBe('BLOCKED_EXPOSURE');
        expect(result.reason).toContain('Max open positions limit reached');
        
        // But adding to existing asset should pass if within asset limits
        const existingResult = riskLimitsService.isEntryAllowed('ASSET1', 1000, 1);
        expect(existingResult.allowed).toBe(true);
    });

    it('5. RISK-REDUCING updates exposure correctly', () => {
        // Open
        riskLimitsService.registerExecutedOrder('BTC-PERPETUAL', 'LONG', 2, 100000, false);
        let snap = riskLimitsService.getSnapshot();
        expect(snap.currentOpenPositions).toBe(1);
        expect(snap.currentExposureByAsset['BTC-PERPETUAL'].positionSize).toBe(2);

        // Reduce partially
        riskLimitsService.registerExecutedOrder('BTC-PERPETUAL', 'SHORT', 1, 50000, true);
        snap = riskLimitsService.getSnapshot();
        expect(snap.currentOpenPositions).toBe(1);
        expect(snap.currentExposureByAsset['BTC-PERPETUAL'].positionSize).toBe(1);

        // Reduce to zero
        riskLimitsService.registerExecutedOrder('BTC-PERPETUAL', 'SHORT', 1, 50000, true);
        snap = riskLimitsService.getSnapshot();
        expect(snap.currentOpenPositions).toBe(0);
        expect(snap.currentExposureByAsset['BTC-PERPETUAL'].positionSize).toBe(0);
    });
});
