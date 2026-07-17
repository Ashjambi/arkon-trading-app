export type PortfolioDrawdownConfig = {
  maxDrawdownLimit: number;    // e.g. 0.20 = 20% max drawdown
  softDrawdownLimit: number;   // e.g. 0.10 = 10% soft warning
  floorLevel: number;          // e.g. 0.85 = 85% of high watermark
  hardStopEnabled: boolean;    // if true, can fully block new risk
};

export type PortfolioDrawdownSnapshot = {
  config: PortfolioDrawdownConfig | null;
  highWatermark: number | null;
  currentEquity: number | null;
  currentDrawdown: number | null;
  floorBreached: boolean;
  softLimitBreached: boolean;
  hardLimitBreached: boolean;
  mode: 'NORMAL' | 'SOFT_DRAWDOWN' | 'HARD_DRAWDOWN';
  lastUpdateAt: string;
};

class PortfolioDrawdownFloorServiceImpl {
  private config: PortfolioDrawdownConfig | null = null;
  private highWatermark: number | null = null;
  private currentEquity: number | null = null;
  private currentDrawdown: number | null = null;
  private mode: 'NORMAL' | 'SOFT_DRAWDOWN' | 'HARD_DRAWDOWN' = 'NORMAL';
  private floorBreached: boolean = false;
  private softLimitBreached: boolean = false;
  private hardLimitBreached: boolean = false;

  configure(config: PortfolioDrawdownConfig): void {
    this.config = config;
    if (this.currentEquity !== null) {
      this.updateEquity(this.currentEquity);
    }
  }

  reset(): void {
    this.config = null;
    this.highWatermark = null;
    this.currentEquity = null;
    this.currentDrawdown = null;
    this.mode = 'NORMAL';
    this.floorBreached = false;
    this.softLimitBreached = false;
    this.hardLimitBreached = false;
  }

  updateEquity(equity: number): void {
    if (this.highWatermark === null) {
      this.highWatermark = equity;
      this.currentEquity = equity;
      this.currentDrawdown = 0;
      this.mode = 'NORMAL';
      return;
    }

    this.currentEquity = equity;

    if (equity > this.highWatermark) {
      this.highWatermark = equity;
    }

    if (this.highWatermark <= 0) {
      this.currentDrawdown = 0;
    } else {
      this.currentDrawdown = (this.highWatermark - this.currentEquity) / this.highWatermark;
    }

    if (!this.config) return;

    this.floorBreached = this.currentEquity <= this.highWatermark * this.config.floorLevel;
    this.softLimitBreached = this.currentDrawdown >= this.config.softDrawdownLimit;
    this.hardLimitBreached = this.currentDrawdown >= this.config.maxDrawdownLimit;

    if (this.hardLimitBreached && this.config.hardStopEnabled) {
      this.mode = 'HARD_DRAWDOWN';
    } else if (this.softLimitBreached || this.floorBreached) {
      this.mode = 'SOFT_DRAWDOWN';
    } else {
      this.mode = 'NORMAL';
    }
  }

  getSnapshot(): PortfolioDrawdownSnapshot {
    return {
      config: this.config ? { ...this.config } : null,
      highWatermark: this.highWatermark,
      currentEquity: this.currentEquity,
      currentDrawdown: this.currentDrawdown,
      floorBreached: this.floorBreached,
      softLimitBreached: this.softLimitBreached,
      hardLimitBreached: this.hardLimitBreached,
      mode: this.mode,
      lastUpdateAt: new Date().toISOString()
    };
  }

  getCurrentMode(): 'NORMAL' | 'SOFT_DRAWDOWN' | 'HARD_DRAWDOWN' {
    return this.mode;
  }

  computeRiskScale(): number {
    if (!this.config || this.currentDrawdown === null || this.mode === 'NORMAL') {
      return 1.0;
    }

    if (this.mode === 'HARD_DRAWDOWN') {
      return 0.0;
    }

    if (this.mode === 'SOFT_DRAWDOWN') {
      const scale = 1.0 - (this.currentDrawdown / this.config.maxDrawdownLimit);
      return Math.max(0.3, Math.min(1.0, scale));
    }

    return 1.0;
  }
}

export const portfolioDrawdownFloorService = new PortfolioDrawdownFloorServiceImpl();
