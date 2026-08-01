import { logStructured } from '../utils/logger';
import { riskLimitsService } from './RiskLimitsService';

export interface PerAssetControlState {
  autoBlocked: boolean;
  reducedRiskMode: boolean;
  cooldownActive: boolean;
  cooldownUntil: string | null;
  lastBlockReason: string | null;
  recentTriggers: {
    degradedDataBursts: number;
    executionSkipBursts: number;
    executionDelayBursts: number;
    toxicityBursts: number;
  };
}

export interface TradingControlSnapshot {
  manualKillSwitch: boolean;
  autoBlocked: boolean;
  reducedRiskMode: boolean;
  cooldownActive: boolean;
  cooldownUntil: string | null;
  lastBlockReason: string | null;
  lastMode: 'NORMAL' | 'REDUCED' | 'BLOCKED';
  recentTriggers: {
    degradedDataBursts: number;
    executionSkipBursts: number;
    executionDelayBursts: number;
    toxicityBursts: number;
  };
  assetStates?: Record<string, PerAssetControlState>;
}

// Constants for burst thresholds
const BURST_THRESHOLD = 3;
const BURST_WINDOW_MS = 60000;
const COOLDOWN_MS = 300000;

function createDefaultPerAssetState(): PerAssetControlState {
  return {
    autoBlocked: false,
    reducedRiskMode: false,
    cooldownActive: false,
    cooldownUntil: null,
    lastBlockReason: null,
    recentTriggers: {
      degradedDataBursts: 0,
      executionSkipBursts: 0,
      executionDelayBursts: 0,
      toxicityBursts: 0,
    },
  };
}

class TradingControlService {
  private manualKillSwitch = false;
  private assetStates: Map<string, PerAssetControlState> = new Map();
  private lastBurstResetTime = Date.now();
  private lastMode: 'NORMAL' | 'REDUCED' | 'BLOCKED' = 'NORMAL';

  private getAssetState(asset?: string): PerAssetControlState {
    const key = asset || 'GLOBAL';
    if (!this.assetStates.has(key)) {
      this.assetStates.set(key, createDefaultPerAssetState());
    }
    return this.assetStates.get(key)!;
  }

  private resetBurstCountersIfNeeded(): void {
    const now = Date.now();
    if (now - this.lastBurstResetTime > BURST_WINDOW_MS) {
      for (const state of this.assetStates.values()) {
        state.recentTriggers.degradedDataBursts = 0;
        state.recentTriggers.executionSkipBursts = 0;
        state.recentTriggers.executionDelayBursts = 0;
        state.recentTriggers.toxicityBursts = 0;
      }
      this.lastBurstResetTime = now;
    }
  }

  public evaluateControlState(asset?: string): 'NORMAL' | 'REDUCED' | 'BLOCKED' {
    if (this.manualKillSwitch) {
      this.lastMode = 'BLOCKED';
      return 'BLOCKED';
    }

    this.resetBurstCountersIfNeeded();
    const state = this.getAssetState(asset);

    // Check cooldown
    if (state.cooldownActive && state.cooldownUntil) {
      if (Date.now() < new Date(state.cooldownUntil).getTime()) {
        this.lastMode = 'BLOCKED';
        return 'BLOCKED';
      }
      // Cooldown expired
      state.cooldownActive = false;
      state.cooldownUntil = null;
      state.autoBlocked = false;
      state.lastBlockReason = null;
    }

    // Check per-asset auto-block
    if (state.autoBlocked) {
      this.lastMode = 'BLOCKED';
      return 'BLOCKED';
    }

    // Burst-level detection (per asset)
    const totalBursts =
      state.recentTriggers.degradedDataBursts +
      state.recentTriggers.executionSkipBursts +
      state.recentTriggers.executionDelayBursts +
      state.recentTriggers.toxicityBursts;

    if (state.autoBlocked || totalBursts >= BURST_THRESHOLD * 2) {
      this.lastMode = 'BLOCKED';
      return 'BLOCKED';
    }

    if (state.reducedRiskMode || totalBursts >= BURST_THRESHOLD) {
      this.lastMode = 'REDUCED';
      return 'REDUCED';
    }

    this.lastMode = 'NORMAL';
    return 'NORMAL';
  }

  public recordDegradedData(asset?: string): void {
    const state = this.getAssetState(asset);
    state.recentTriggers.degradedDataBursts++;
    if (state.recentTriggers.degradedDataBursts >= BURST_THRESHOLD) {
      state.autoBlocked = true;
      state.lastBlockReason = `Degraded data bursts reached threshold for ${asset || 'GLOBAL'}`;
      logStructured('SYSTEM', 'WARN', 'control_block', state.lastBlockReason);
    }
  }

  public recordExecutionSkip(asset?: string): void {
    const state = this.getAssetState(asset);
    state.recentTriggers.executionSkipBursts++;
    if (state.recentTriggers.executionSkipBursts >= BURST_THRESHOLD) {
      state.autoBlocked = true;
      state.lastBlockReason = `Execution skip bursts reached threshold for ${asset || 'GLOBAL'}`;
      logStructured('SYSTEM', 'WARN', 'control_block', state.lastBlockReason);
      this.startCooldown(asset);
    }
  }

  public recordExecutionDelay(asset?: string): void {
    const state = this.getAssetState(asset);
    state.recentTriggers.executionDelayBursts++;
    if (state.recentTriggers.executionDelayBursts >= BURST_THRESHOLD) {
      state.reducedRiskMode = true;
      state.lastBlockReason = `Execution delay bursts reached threshold for ${asset || 'GLOBAL'}`;
      logStructured('SYSTEM', 'WARN', 'control_reduced', state.lastBlockReason);
    }
  }

  public recordNormalExecution(asset?: string): void {
    const state = this.getAssetState(asset);
    // Gradually decrease burst counters on normal execution
    state.recentTriggers.degradedDataBursts = Math.max(0, state.recentTriggers.degradedDataBursts - 1);
    state.recentTriggers.executionSkipBursts = Math.max(0, state.recentTriggers.executionSkipBursts - 1);
    state.recentTriggers.executionDelayBursts = Math.max(0, state.recentTriggers.executionDelayBursts - 1);
    state.recentTriggers.toxicityBursts = Math.max(0, state.recentTriggers.toxicityBursts - 1);

    if (state.recentTriggers.executionDelayBursts === 0) {
      state.reducedRiskMode = false;
    }
  }

  public startCooldown(asset?: string): void {
    const state = this.getAssetState(asset);
    state.cooldownActive = true;
    state.cooldownUntil = new Date(Date.now() + COOLDOWN_MS).toISOString();
    state.autoBlocked = true;
    state.lastBlockReason = `Cooldown active for ${asset || 'GLOBAL'} until ${state.cooldownUntil}`;
    logStructured('SYSTEM', 'WARN', 'control_block', state.lastBlockReason);
  }

  public setManualKillSwitch(enabled: boolean): void {
    this.manualKillSwitch = enabled;
    if (enabled) {
      this.lastMode = 'BLOCKED';
      for (const [asset, state] of this.assetStates.entries()) {
        state.autoBlocked = true;
        state.lastBlockReason = `Manual Kill Switch active${asset ? ` (${asset})` : ''}`;
      }
      if (!this.assetStates.has('GLOBAL')) {
        const globalState = createDefaultPerAssetState();
        globalState.autoBlocked = true;
        globalState.lastBlockReason = 'Manual Kill Switch active';
        this.assetStates.set('GLOBAL', globalState);
      }
    } else {
      for (const state of this.assetStates.values()) {
        state.autoBlocked = false;
        state.lastBlockReason = null;
      }
      this.lastMode = 'NORMAL';
    }
  }

  public getSnapshot(asset?: string): TradingControlSnapshot {
    const state = this.getAssetState(asset);

    const assetStatesObj: Record<string, PerAssetControlState> = {};
    for (const [key, value] of this.assetStates.entries()) {
      assetStatesObj[key] = {
        autoBlocked: value.autoBlocked,
        reducedRiskMode: value.reducedRiskMode,
        cooldownActive: value.cooldownActive,
        cooldownUntil: value.cooldownUntil,
        lastBlockReason: value.lastBlockReason,
        recentTriggers: { ...value.recentTriggers },
      };
    }

    return {
      manualKillSwitch: this.manualKillSwitch,
      autoBlocked: state.autoBlocked,
      reducedRiskMode: state.reducedRiskMode,
      cooldownActive: state.cooldownActive,
      cooldownUntil: state.cooldownUntil,
      lastBlockReason: state.lastBlockReason,
      lastMode: this.lastMode,
      recentTriggers: { ...state.recentTriggers },
      assetStates: assetStatesObj,
    };
  }

  public registerMarginAlert(asset?: string): void {
    const key = asset || 'GLOBAL';
    const marginPercent = 0;

    if (marginPercent >= 85) {
      this.startCooldown(key);
      const state = this.getAssetState(key);
      state.lastBlockReason = `Margin usage critical (${marginPercent}%) for ${key}`;
      logStructured('SYSTEM', 'WARN', 'control_block', state.lastBlockReason);
      return;
    }

    if (marginPercent >= 70) {
      const state = this.getAssetState(key);
      state.reducedRiskMode = true;
      state.lastBlockReason = `Margin usage elevated (${marginPercent}%) for ${key}`;
      logStructured('SYSTEM', 'WARN', 'control_reduced', state.lastBlockReason);
    }
  }

  public reset(): void {
    this.manualKillSwitch = false;
    this.assetStates.clear();
    this.lastBurstResetTime = Date.now();
    this.lastMode = 'NORMAL';
  }
}

export const tradingControlService = new TradingControlService();
