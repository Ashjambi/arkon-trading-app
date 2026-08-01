import { logStructured } from '../utils/logger';
import { portfolioDrawdownFloorService } from './PortfolioDrawdownFloorService';
import { portfolioVolatilityTargetService } from './PortfolioVolatilityTargetService';
import { tailRiskModeService } from './TailRiskModeService';
import { riskLimitsService } from './RiskLimitsService';

export type EquityDataFeedSnapshot = {
  lastEquity: number | null;
  lastPnL: number | null;
  lastPortfolioVol: number | null;
  lastBaselineVol: number | null;
  updateIntervalMs: number;
  lastUpdateAt: string | null;
  servicesActive: {
    drawdownFloor: boolean;
    volatilityTarget: boolean;
    tailRiskMode: boolean;
    riskLimits: boolean;
  };
};

export interface BridgeState {
  equity?: number;
  baseline?: number;
  diff?: number;
  budget?: number;
  marketQuotes?: Record<string, { last?: number }>;
}

class EquityDataFeedServiceImpl {
  private lastEquity: number | null = null;
  private lastPnL: number | null = null;
  private lastPortfolioVol: number | null = null;
  private lastBaselineVol: number | null = null;
  private lastUpdateAt: string | null = null;
  private updateIntervalMs: number = 60000; // 1 minute default
  private intervalId: ReturnType<typeof setInterval> | null = null;

  /**
   * Start the periodic equity/volatility data feed.
   * Calls each risk service's update method with real data.
   */
  public start(bridgeStateProvider: () => BridgeState | null, intervalMs: number = 60000): void {
    this.updateIntervalMs = intervalMs;
    
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }

    // Immediate first update
    this.update(bridgeStateProvider());

    // Periodic updates
    this.intervalId = setInterval(() => {
      try {
        this.update(bridgeStateProvider());
      } catch (err: any) {
        logStructured('SYSTEM', 'ERROR', 'equity_feed_error', `EquityDataFeed update error: ${err?.message || err}`, {
          error: err?.message || err
        });
      }
    }, this.updateIntervalMs);

    logStructured('SYSTEM', 'INFO', 'equity_feed_started', `EquityDataFeedService started (interval: ${this.updateIntervalMs}ms)`, {
      intervalMs: this.updateIntervalMs
    });
  }

  /**
   * Stop the periodic data feed.
   */
  public stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    logStructured('SYSTEM', 'INFO', 'equity_feed_stopped', 'EquityDataFeedService stopped');
  }

  /**
   * Single update cycle: feeds all risk services with current data.
   */
  public update(bridgeState: BridgeState | null): void {
    if (!bridgeState) {
      logStructured('SYSTEM', 'WARN', 'equity_feed_no_state', 'EquityDataFeed received null bridge state — skipping update');
      return;
    }

    // 1. Extract equity and PnL from bridge state
    const equity = bridgeState.equity ?? bridgeState.baseline ?? null;
    const pnl = bridgeState.diff ?? null;
    
    if (equity !== null && equity > 0) {
      this.lastEquity = equity;
      this.lastPnL = pnl;
      
      // Feed PortfolioDrawdownFloorService
      portfolioDrawdownFloorService.updateEquity(equity);
      logStructured('RISK', 'INFO', 'drawdown_feed', `Drawdown floor updated with equity=${equity.toFixed(2)}`, {
        equity,
        pnl,
        mode: portfolioDrawdownFloorService.getCurrentMode(),
        drawdown: portfolioDrawdownFloorService.getSnapshot().currentDrawdown
      });
    }

    // 2. Calculate portfolio volatility from market quotes
    let portfolioVol = this.lastPortfolioVol;
    if (bridgeState.marketQuotes && Object.keys(bridgeState.marketQuotes).length > 0) {
      const quotes = bridgeState.marketQuotes;
      const prices: number[] = [];
      
      for (const symbol of Object.keys(quotes)) {
        const lastPrice = quotes[symbol]?.last;
        if (lastPrice && lastPrice > 0) {
          prices.push(lastPrice);
        }
      }
      
      if (prices.length > 0) {
        // Simple estimator: coefficient of variation across assets as vol proxy
        const meanPrice = prices.reduce((a, b) => a + b, 0) / prices.length;
        const variance = prices.reduce((sum, p) => sum + Math.pow(p - meanPrice, 2), 0) / prices.length;
        const cv = meanPrice > 0 ? Math.sqrt(variance) / meanPrice : 0.3;
        portfolioVol = Math.min(1.0, Math.max(0.05, cv * 2)); // Scale to 5%-100% range
        this.lastPortfolioVol = portfolioVol;
      }
    }

    // Fallback: use last known vol or a moderate default
    const effectiveVol = portfolioVol ?? this.lastPortfolioVol ?? 0.3;

    // Feed PortfolioVolatilityTargetService
    portfolioVolatilityTargetService.updateVolEstimate(effectiveVol);
    const volScale = portfolioVolatilityTargetService.computeScale();
    logStructured('RISK', 'INFO', 'vol_target_feed', `Vol target updated: vol=${(effectiveVol * 100).toFixed(1)}%, scale=${volScale.toFixed(3)}`, {
      estimatedVol: effectiveVol,
      scale: volScale,
      snapshot: portfolioVolatilityTargetService.getSnapshot()
    });

    // 3. Feed TailRiskModeService
    const drawdownSnapshot = portfolioDrawdownFloorService.getSnapshot();
    tailRiskModeService.evaluateAutoTriggers({
      currentDrawdown: drawdownSnapshot.currentDrawdown,
      currentVolEstimate: effectiveVol,
      baselineVol: this.lastBaselineVol
    });

    const tailMode = tailRiskModeService.getMode();
    if (tailMode === 'TAIL_RISK') {
      logStructured('RISK', 'WARN', 'tail_risk_triggered', `⚠️ TAIL RISK MODE ACTIVATED — reducing risk`, {
        reason: tailRiskModeService.getSnapshot().lastReason,
        drawdown: drawdownSnapshot.currentDrawdown,
        vol: effectiveVol,
        tailScale: tailRiskModeService.getTailScale()
      });
    }

    // 4. Feed RiskLimitsService with PnL
    if (pnl !== null) {
      riskLimitsService.updateDailyPnL(pnl);
    }

    this.lastBaselineVol = this.lastBaselineVol ?? effectiveVol;
    this.lastUpdateAt = new Date().toISOString();
  }

  /**
   * Manually set a portfolio volatility estimate (e.g., from DVOL data).
   */
  public setPortfolioVol(vol: number): void {
    this.lastPortfolioVol = vol;
    portfolioVolatilityTargetService.updateVolEstimate(vol);
  }

  public getSnapshot(): EquityDataFeedSnapshot {
    return {
      lastEquity: this.lastEquity,
      lastPnL: this.lastPnL,
      lastPortfolioVol: this.lastPortfolioVol,
      lastBaselineVol: this.lastBaselineVol,
      updateIntervalMs: this.updateIntervalMs,
      lastUpdateAt: this.lastUpdateAt,
      servicesActive: {
        drawdownFloor: this.lastEquity !== null,
        volatilityTarget: this.lastPortfolioVol !== null,
        tailRiskMode: true,
        riskLimits: this.lastPnL !== null
      }
    };
  }

  /**
   * Configure all risk services with institutional defaults.
   */
  public configureDefaults(): void {
    // Portfolio Volatility Target: target 20% annualized, scale between 0.3 and 2.0
    portfolioVolatilityTargetService.configure({
      targetVol: 0.20,
      minScale: 0.3,
      maxScale: 2.0
    });

    // Drawdown Floor: 20% max drawdown, 10% soft warning, 85% floor
    portfolioDrawdownFloorService.configure({
      maxDrawdownLimit: 0.20,
      softDrawdownLimit: 0.10,
      floorLevel: 0.85,
      hardStopEnabled: true
    });

    // Tail Risk Mode: enabled, triggers at 12% drawdown or 2.5x vol spike
    tailRiskModeService.configure({
      enabled: true,
      tailScale: 0.5,
      allowedStrategies: ['SCALPER', 'ARBITRAGE_SCANNER', 'OFI'],
      autoTriggerFromDrawdown: true,
      autoTriggerDrawdownThreshold: 0.12,
      autoTriggerFromVolSpike: true,
      volSpikeThreshold: 2.5
    });

    logStructured('SYSTEM', 'INFO', 'risk_services_configured', 'All risk services configured with institutional defaults', {
      volTarget: { targetVol: 0.20, minScale: 0.3, maxScale: 2.0 },
      drawdownFloor: { max: 0.20, soft: 0.10, floor: 0.85, hardStop: true },
      tailRisk: { enabled: true, drawdownTrigger: 0.12, volSpike: 2.5 }
    });
  }
}

export const equityDataFeedService = new EquityDataFeedServiceImpl();
