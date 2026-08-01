export type TailRiskConfig = {
  enabled: boolean;
  tailScale: number;
  allowedStrategies?: string[];
  autoTriggerFromDrawdown: boolean;
  autoTriggerDrawdownThreshold?: number;
  autoTriggerFromVolSpike: boolean;
  volSpikeThreshold?: number;
  /** Max concurrent trades allowed during tail risk mode (0 = no new trades) */
  maxConcurrentInTail?: number;
  /** Whether Hunter Mode is allowed during tail risk (default: false) */
  hunterModeAllowed?: boolean;
};

export type TailRiskModeSnapshot = {
  config: TailRiskConfig | null;
  mode: 'NORMAL' | 'TAIL_RISK';
  lastReason?: string;
  lastUpdateAt: string;
};

export type TailState = {
  tailActive: boolean;
  tailScale: number;
  drawdown: number | null;
  volSpike: number | null;
  reason: string;
  maxConcurrentInTail: number;
  hunterModeAllowed: boolean;
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

  /**
   * Returns a comprehensive tail state object used by the Crash Overlay
   * in ExecutionOrchestrator and other risk layers.
   */
  getTailState(): TailState {
    const tailActive = this.mode === 'TAIL_RISK';
    const tailScale = this.getTailScale();

    return {
      tailActive,
      tailScale,
      drawdown: null,    // Updated externally by EquityDataFeedService
      volSpike: null,    // Updated externally by EquityDataFeedService
      reason: tailActive ? (this.lastReason ?? 'UNKNOWN') : 'NONE',
      maxConcurrentInTail: tailActive
        ? (this.config?.maxConcurrentInTail ?? 1)
        : 3,
      hunterModeAllowed: tailActive
        ? (this.config?.hunterModeAllowed ?? false)
        : true,
    };
  }

  /**
   * Reset tail risk mode back to NORMAL.
   * Called by EquityDataFeedService when conditions improve.
   */
  resetTailMode(): void {
    if (this.mode === 'TAIL_RISK') {
      this.mode = 'NORMAL';
      this.lastReason = 'RECOVERED';
    }
  }

  evaluateAutoTriggers(params: {
    currentDrawdown?: number | null;
    currentVolEstimate?: number | null;
    baselineVol?: number | null;
  }): void {
    if (!this.config || !this.config.enabled) {
      return;
    }

    // If we're already in TAIL_RISK, check if we should recover
    if (this.mode === 'TAIL_RISK') {
      const drawdownCleared = params.currentDrawdown !== null && params.currentDrawdown !== undefined &&
        this.config.autoTriggerDrawdownThreshold !== undefined &&
        this.config.autoTriggerDrawdownThreshold !== null &&
        params.currentDrawdown < this.config.autoTriggerDrawdownThreshold * 0.7; // 70% of trigger = recovery

      const volCleared = params.currentVolEstimate !== null && params.currentVolEstimate !== undefined &&
        params.baselineVol !== null && params.baselineVol !== undefined &&
        this.config.volSpikeThreshold !== undefined &&
        this.config.volSpikeThreshold !== null &&
        params.baselineVol > 0 &&
        params.currentVolEstimate < params.baselineVol * this.config.volSpikeThreshold * 0.7;

      if (drawdownCleared && volCleared) {
        this.mode = 'NORMAL';
        this.lastReason = 'RECOVERED';
      }
      return;
    }

    // Normal mode: check triggers
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
