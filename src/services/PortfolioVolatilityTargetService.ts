export type PortfolioVolTargetConfig = {
  targetVol: number;
  minScale: number;
  maxScale: number;
};

export type PortfolioVolTargetSnapshot = {
  config: PortfolioVolTargetConfig | null;
  lastEstimatedVol: number | null;
  lastScale: number;
  updatedAt: string;
};

class PortfolioVolatilityTargetServiceImpl {
  private config: PortfolioVolTargetConfig | null = null;
  private lastEstimatedVol: number | null = null;
  private lastScale: number = 1.0;

  configure(config: PortfolioVolTargetConfig): void {
    this.config = config;
  }

  reset(): void {
    this.config = null;
    this.lastEstimatedVol = null;
    this.lastScale = 1.0;
  }

  updateVolEstimate(estimate: number): void {
    this.lastEstimatedVol = estimate;
  }

  getSnapshot(): PortfolioVolTargetSnapshot {
    return {
      config: this.config ? { ...this.config } : null,
      lastEstimatedVol: this.lastEstimatedVol,
      lastScale: this.lastScale,
      updatedAt: new Date().toISOString()
    };
  }

  computeScale(): number {
    if (!this.config || this.lastEstimatedVol === null || this.lastEstimatedVol === 0) {
      this.lastScale = 1.0;
      return 1.0;
    }

    const baseScale = this.config.targetVol / this.lastEstimatedVol;
    this.lastScale = Math.max(this.config.minScale, Math.min(this.config.maxScale, baseScale));
    
    return this.lastScale;
  }
}

export const portfolioVolatilityTargetService = new PortfolioVolatilityTargetServiceImpl();
