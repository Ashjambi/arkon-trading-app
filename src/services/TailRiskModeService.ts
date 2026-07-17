export type TailRiskConfig = {
  enabled: boolean;
  tailScale: number;
  allowedStrategies?: string[];
  autoTriggerFromDrawdown: boolean;
  autoTriggerDrawdownThreshold?: number;
  autoTriggerFromVolSpike: boolean;
  volSpikeThreshold?: number;
};

export type TailRiskModeSnapshot = {
  config: TailRiskConfig | null;
  mode: 'NORMAL' | 'TAIL_RISK';
  lastReason?: string;
  lastUpdateAt: string;
};

class TailRiskModeServiceImpl {
  private config: TailRiskConfig | null = null;
  private mode: 'NORMAL' | 'TAIL_RISK' = 'NORMAL';
  private lastReason?: string;

  configure(config: TailRiskConfig): void {
    this.config = config;
    if (!config.enabled) {
      this.mode = 'NORMAL';
      this.lastReason = undefined;
    }
  }

  reset(): void {
    this.config = null;
    this.mode = 'NORMAL';
    this.lastReason = undefined;
  }

  getSnapshot(): TailRiskModeSnapshot {
    return {
      config: this.config ? { ...this.config } : null,
      mode: this.mode,
      lastReason: this.lastReason,
      lastUpdateAt: new Date().toISOString()
    };
  }

  getMode(): 'NORMAL' | 'TAIL_RISK' {
    return this.mode;
  }

  shouldAllowStrategy(strategy: string): boolean {
    if (this.mode === 'NORMAL') {
      return true;
    }

    if (!this.config || !this.config.allowedStrategies || this.config.allowedStrategies.length === 0) {
      return true;
    }

    return this.config.allowedStrategies.includes(strategy);
  }

  getTailScale(): number {
    if (!this.config || !this.config.enabled || this.mode === 'NORMAL') {
      return 1.0;
    }
    return this.config.tailScale;
  }

  evaluateAutoTriggers(params: {
    currentDrawdown?: number | null;
    currentVolEstimate?: number | null;
    baselineVol?: number | null;
  }): void {
    if (!this.config || !this.config.enabled) {
      return;
    }

    if (this.config.autoTriggerFromDrawdown && params.currentDrawdown !== undefined && params.currentDrawdown !== null && this.config.autoTriggerDrawdownThreshold !== undefined && this.config.autoTriggerDrawdownThreshold !== null) {
      if (params.currentDrawdown >= this.config.autoTriggerDrawdownThreshold) {
        this.mode = 'TAIL_RISK';
        this.lastReason = 'DRAWDOWN_TRIGGER';
      }
    }

    if (this.config.autoTriggerFromVolSpike && params.currentVolEstimate !== undefined && params.currentVolEstimate !== null && params.baselineVol !== undefined && params.baselineVol !== null && this.config.volSpikeThreshold !== undefined && this.config.volSpikeThreshold !== null) {
      if (params.baselineVol > 0 && params.currentVolEstimate >= params.baselineVol * this.config.volSpikeThreshold) {
        this.mode = 'TAIL_RISK';
        if (this.lastReason !== 'DRAWDOWN_TRIGGER') {
            this.lastReason = 'VOL_SPIKE_TRIGGER';
        }
      }
    }
  }
}

export const tailRiskModeService = new TailRiskModeServiceImpl();
