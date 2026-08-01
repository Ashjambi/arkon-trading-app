import { describe, it, expect, beforeEach } from 'vitest';
import { AssetPerformanceMonitor } from './AssetPerformanceMonitor';

describe('AssetPerformanceMonitor', () => {
  let monitor: AssetPerformanceMonitor;

  beforeEach(() => {
    monitor = new AssetPerformanceMonitor();
  });

  describe('recordTrade', () => {
    it('should track wins and losses correctly', () => {
      // Record 10 trades: 7 wins, 3 losses
      for (let i = 0; i < 7; i++) {
        monitor.recordTrade('BTC', 'BTC_TREND', 'WIN', 100, 30);
      }
      for (let i = 0; i < 3; i++) {
        monitor.recordTrade('BTC', 'BTC_TREND', 'LOSS', -50, 45);
      }

      const stats = monitor.getStats('BTC', 'BTC_TREND');
      expect(stats).not.toBeNull();
      expect(stats!.wins).toBe(7);
      expect(stats!.losses).toBe(3);
      expect(stats!.totalTrades).toBe(10);
      expect(stats!.winRate).toBeCloseTo(0.7, 1);
      expect(stats!.totalPnl).toBe(7 * 100 - 3 * 50); // 550
    });

    it('should track multiple assets independently', () => {
      monitor.recordTrade('BTC', 'BTC_TREND', 'WIN', 100, 30);
      monitor.recordTrade('ETH', 'ETH_TREND', 'LOSS', -50, 45);
      monitor.recordTrade('SOL', 'SOL_SCALPER', 'WIN', 25, 10);

      expect(monitor.getStats('BTC', 'BTC_TREND')!.wins).toBe(1);
      expect(monitor.getStats('ETH', 'ETH_TREND')!.losses).toBe(1);
      expect(monitor.getStats('SOL', 'SOL_SCALPER')!.wins).toBe(1);

      // Non-existent pair should return null
      expect(monitor.getStats('XRP', 'XRP_TREND')).toBeNull();
    });

    it('should track consecutive losses', () => {
      for (let i = 0; i < 5; i++) {
        monitor.recordTrade('BTC', 'BTC_TREND', 'LOSS', -50, 30);
      }
      const stats = monitor.getStats('BTC', 'BTC_TREND');
      expect(stats!.consecutiveLosses).toBe(5);

      // A win should reset consecutive losses
      monitor.recordTrade('BTC', 'BTC_TREND', 'WIN', 100, 30);
      expect(monitor.getStats('BTC', 'BTC_TREND')!.consecutiveLosses).toBe(0);
    });
  });

  describe('shouldDisable', () => {
    it('should NOT disable before minimum trades', () => {
      // 15 trades, 4 wins (26% win rate, below 30% threshold) but only 15 trades
      for (let i = 0; i < 4; i++) {
        monitor.recordTrade('BTC', 'BTC_TREND', 'WIN', 100, 30);
      }
      for (let i = 0; i < 11; i++) {
        monitor.recordTrade('BTC', 'BTC_TREND', 'LOSS', -50, 45);
      }

      expect(monitor.shouldDisable('BTC', 'BTC_TREND')).toBe(false);
    });

    it('should disable when win rate is below threshold after minimum trades', () => {
      // 20 trades: 5 wins, 15 losses → 25% win rate
      for (let i = 0; i < 5; i++) {
        monitor.recordTrade('BTC', 'BTC_TREND', 'WIN', 100, 30);
      }
      for (let i = 0; i < 15; i++) {
        monitor.recordTrade('BTC', 'BTC_TREND', 'LOSS', -50, 45);
      }

      const stats = monitor.getStats('BTC', 'BTC_TREND');
      expect(stats!.totalTrades).toBe(20);
      expect(stats!.winRate).toBeCloseTo(0.25, 1);
      expect(monitor.shouldDisable('BTC', 'BTC_TREND')).toBe(true);
    });

    it('should NOT disable when win rate is above threshold', () => {
      // 20 trades: 15 wins, 5 losses → 75% win rate
      for (let i = 0; i < 15; i++) {
        monitor.recordTrade('BTC', 'BTC_TREND', 'WIN', 100, 30);
      }
      for (let i = 0; i < 5; i++) {
        monitor.recordTrade('BTC', 'BTC_TREND', 'LOSS', -50, 45);
      }

      expect(monitor.shouldDisable('BTC', 'BTC_TREND')).toBe(false);
    });

    it('should disable after 10 consecutive losses', () => {
      for (let i = 0; i < 10; i++) {
        monitor.recordTrade('BTC', 'BTC_TREND', 'LOSS', -50, 30);
      }

      expect(monitor.shouldDisable('BTC', 'BTC_TREND')).toBe(true);
    });

    it('should not re-disable an already disabled strategy', () => {
      // Trigger disable
      for (let i = 0; i < 5; i++) {
        monitor.recordTrade('BTC', 'BTC_TREND', 'WIN', 100, 30);
      }
      for (let i = 0; i < 15; i++) {
        monitor.recordTrade('BTC', 'BTC_TREND', 'LOSS', -50, 45);
      }

      expect(monitor.shouldDisable('BTC', 'BTC_TREND')).toBe(true);
      // Should not re-disable once already disabled
      expect(monitor.shouldDisable('BTC', 'BTC_TREND')).toBe(false);
    });
  });

  describe('shouldReenable', () => {
    it('should re-enable a disabled strategy when win rate recovers', () => {
      // First, trigger disable: 5 wins, 15 losses
      for (let i = 0; i < 5; i++) {
        monitor.recordTrade('BTC', 'BTC_TREND', 'WIN', 100, 30);
      }
      for (let i = 0; i < 15; i++) {
        monitor.recordTrade('BTC', 'BTC_TREND', 'LOSS', -50, 45);
      }

      expect(monitor.isDisabled('BTC', 'BTC_TREND')).toBe(true);

      // Now recover: add 20 more trades with 15 wins (75%)
      for (let i = 0; i < 15; i++) {
        monitor.recordTrade('BTC', 'BTC_TREND', 'WIN', 100, 30);
      }
      for (let i = 0; i < 5; i++) {
        monitor.recordTrade('BTC', 'BTC_TREND', 'LOSS', -50, 45);
      }

      // Now total: 20 wins, 20 losses, total 40 trades = 50% win rate
      const stats = monitor.getStats('BTC', 'BTC_TREND');
      expect(stats!.totalTrades).toBe(40);
      expect(stats!.winRate).toBeCloseTo(0.5, 1);

      expect(monitor.shouldReenable('BTC', 'BTC_TREND')).toBe(true);
    });
  });

  describe('isDisabled', () => {
    it('should return false for strategies that were never disabled', () => {
      monitor.recordTrade('BTC', 'BTC_TREND', 'WIN', 100, 30);
      expect(monitor.isDisabled('BTC', 'BTC_TREND')).toBe(false);
    });

    it('should return true after automatic disable', () => {
      for (let i = 0; i < 5; i++) {
        monitor.recordTrade('BTC', 'BTC_TREND', 'WIN', 100, 30);
      }
      for (let i = 0; i < 15; i++) {
        monitor.recordTrade('BTC', 'BTC_TREND', 'LOSS', -50, 45);
      }

      expect(monitor.isDisabled('BTC', 'BTC_TREND')).toBe(true);
    });
  });

  describe('getDisabledStrategies', () => {
    it('should return all disabled strategies', () => {
      // Disable BTC_TREND
      for (let i = 0; i < 5; i++) {
        monitor.recordTrade('BTC', 'BTC_TREND', 'WIN', 100, 30);
      }
      for (let i = 0; i < 15; i++) {
        monitor.recordTrade('BTC', 'BTC_TREND', 'LOSS', -50, 45);
      }

      // BTC_SCALPER should not be disabled (good performance)
      for (let i = 0; i < 18; i++) {
        monitor.recordTrade('BTC', 'BTC_SCALPER', 'WIN', 50, 5);
      }
      for (let i = 0; i < 2; i++) {
        monitor.recordTrade('BTC', 'BTC_SCALPER', 'LOSS', -25, 8);
      }

      const disabled = monitor.getDisabledStrategies();
      expect(disabled.length).toBe(1);
      expect(disabled[0].asset).toBe('BTC');
      expect(disabled[0].strategy).toBe('BTC_TREND');
    });
  });

  describe('reset', () => {
    it('should clear all stats and disabled flags', () => {
      for (let i = 0; i < 5; i++) {
        monitor.recordTrade('BTC', 'BTC_TREND', 'WIN', 100, 30);
      }
      for (let i = 0; i < 15; i++) {
        monitor.recordTrade('BTC', 'BTC_TREND', 'LOSS', -50, 45);
      }

      expect(monitor.isDisabled('BTC', 'BTC_TREND')).toBe(true);
      expect(monitor.getSnapshot().length).toBeGreaterThan(0);

      monitor.reset();

      expect(monitor.isDisabled('BTC', 'BTC_TREND')).toBe(false);
      expect(monitor.getSnapshot().length).toBe(0);
    });
  });
});
