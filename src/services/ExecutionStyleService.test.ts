import { describe, it, expect } from 'vitest';
import { executionStyleService } from './ExecutionStyleService';

describe('ExecutionStyleService', () => {
    it('1) Tail / hard drawdown -> PASSIVE', () => {
        expect(executionStyleService.decideStyle({
            signalQualityScore: 90, volatilityRegime: 'LOW', stressScenarioEnabled: false,
            tailRiskMode: 'TAIL_RISK', drawdownMode: 'NORMAL'
        })).toBe('PASSIVE');

        expect(executionStyleService.decideStyle({
            signalQualityScore: 90, volatilityRegime: 'LOW', stressScenarioEnabled: false,
            tailRiskMode: 'NORMAL', drawdownMode: 'HARD_DRAWDOWN'
        })).toBe('PASSIVE');
    });

    it('2) High volatility with strong signal -> MID', () => {
        expect(executionStyleService.decideStyle({
            signalQualityScore: 75, volatilityRegime: 'HIGH_VOLATILITY', stressScenarioEnabled: false,
            tailRiskMode: 'NORMAL', drawdownMode: 'NORMAL'
        })).toBe('MID');
        
        expect(executionStyleService.decideStyle({
            signalQualityScore: 90, volatilityRegime: 'LOW', stressScenarioEnabled: true,
            tailRiskMode: 'NORMAL', drawdownMode: 'NORMAL'
        })).toBe('MID');
    });

    it('3) High volatility with weak/medium signal -> PASSIVE', () => {
        expect(executionStyleService.decideStyle({
            signalQualityScore: 60, volatilityRegime: 'HIGH_VOLATILITY', stressScenarioEnabled: false,
            tailRiskMode: 'NORMAL', drawdownMode: 'NORMAL'
        })).toBe('PASSIVE');
    });

    it('4) Strong signal, normal volatility -> AGGRESSIVE', () => {
        expect(executionStyleService.decideStyle({
            signalQualityScore: 85, volatilityRegime: 'LOW_VOLATILITY', stressScenarioEnabled: false,
            tailRiskMode: 'NORMAL', drawdownMode: 'NORMAL'
        })).toBe('AGGRESSIVE');
    });

    it('5) Medium signal -> MID', () => {
        expect(executionStyleService.decideStyle({
            signalQualityScore: 60, volatilityRegime: 'LOW_VOLATILITY', stressScenarioEnabled: false,
            tailRiskMode: 'NORMAL', drawdownMode: 'NORMAL'
        })).toBe('MID');
    });

    it('6) Weak signal -> PASSIVE', () => {
        expect(executionStyleService.decideStyle({
            signalQualityScore: 40, volatilityRegime: 'LOW_VOLATILITY', stressScenarioEnabled: false,
            tailRiskMode: 'NORMAL', drawdownMode: 'NORMAL'
        })).toBe('PASSIVE');
    });
});
