import { AppConfig, MarketAnalysisState, TradingSignal } from '../types';

export type HunterTrailingMode = 'DEFAULT' | 'SMART_RELAXED' | 'SMART_TIGHT';

export interface HunterModeModifiers {
  sizeMultiplier: number;
  targetMultiplier: number;
  trailingMode: HunterTrailingMode;
  allowAddOnEntry: boolean;
  allowReentry: boolean;
  cooldownOverride: number;
  maxWaveTradesOverride: number;
}

export interface HunterModeDecision {
  enabled: boolean;
  score: number;
  reasons: string[];
  blockers: string[];
  modifiers: HunterModeModifiers;
}

export interface HunterModeEvaluationInput {
  signal: TradingSignal;
  marketState: MarketAnalysisState;
  riskState: {
    controlMode: 'NORMAL' | 'REDUCED' | 'BLOCKED';
    riskPressureHigh: boolean;
    drawdownBrakeActive: boolean;
    emergencyProtectionActive: boolean;
    openPositions: number;
  };
  executionState: {
    bridgeHealthy: boolean;
    executionConfidence: number;
  };
  accountState: {
    drawdownPercent: number;
    activeHunterTrades: number;
  };
  config: AppConfig;
  actionType?: string;
}

export interface HunterModeDecisionRecord {
  timestampUtc: string;
  asset: string;
  strategy: string;
  actionType: string;
  decision: HunterModeDecision;
}

export interface HunterModeSnapshot {
  enabledEvaluations: number;
  rejectedEvaluations: number;
  totalEvaluations: number;
  totalHunterTrades: number;
  activeHunterTrades: number;
  rejectionByReason: Record<string, number>;
  lastDecision: HunterModeDecisionRecord | null;
  updatedAt: string;
}

export const getHunterDefaults = (config: AppConfig) => ({
  hunterModeEnabled: config.hunterModeEnabled ?? false,
  hunterMinSignalScore: config.hunterMinSignalScore ?? 88,
  hunterAllowedRegimes: config.hunterAllowedRegimes ?? ['MOMENTUM_TREND', 'HIGH_VOLATILITY'],
  hunterMaxSpreadBps: config.hunterMaxSpreadBps ?? 18,
  hunterMinLiquidityScore: config.hunterMinLiquidityScore ?? 60,
  hunterMaxVolatilityScore: config.hunterMaxVolatilityScore ?? 85,
  hunterSizeMultiplier: config.hunterSizeMultiplier ?? 1.25,
  hunterTargetMultiplier: config.hunterTargetMultiplier ?? 1.2,
  hunterAllowAddOnEntry: config.hunterAllowAddOnEntry ?? true,
  hunterAllowReentry: config.hunterAllowReentry ?? true,
  hunterMaxConcurrentHunterTrades: config.hunterMaxConcurrentHunterTrades ?? 3,
  hunterCooldownSeconds: config.hunterCooldownSeconds ?? 20,
  hunterMinExecutionConfidence: config.hunterMinExecutionConfidence ?? 0.7,
  hunterDisableDuringDrawdown: config.hunterDisableDuringDrawdown ?? true,
  hunterDrawdownThreshold: config.hunterDrawdownThreshold ?? 3.0,
  hunterLogDecisions: config.hunterLogDecisions ?? true,
});

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const deriveSpreadBps = (marketState: MarketAnalysisState): number => {
  const slippage = Math.max(0, marketState.estimatedSlippage || 0);
  return slippage * 10000;
};

const deriveLiquidityScore = (marketState: MarketAnalysisState): number => {
  const volRatio = clamp((marketState.volRatio || 0) / 2, 0, 1);
  const toxicityPenalty = clamp((marketState.toxicityScore || 0), 0, 1);
  const slippagePenalty = clamp((marketState.estimatedSlippage || 0) * 1000, 0, 1);
  return Math.round((volRatio * 0.7 + (1 - toxicityPenalty) * 0.2 + (1 - slippagePenalty) * 0.1) * 100);
};

const deriveVolatilityScore = (marketState: MarketAnalysisState): number => {
  const dvolScore = clamp((marketState.dvol || 0) / 120, 0, 1);
  const realizedScore = clamp((marketState.volatility || 0) / Math.max(1, marketState.price || 1) * 100, 0, 1);
  return Math.round((dvolScore * 0.65 + realizedScore * 0.35) * 100);
};

const inferContinuation = (signal: TradingSignal, marketState: MarketAnalysisState): boolean => {
  if (signal.direction === 'LONG') return marketState.trendDirection === 'UP';
  if (signal.direction === 'SHORT') return marketState.trendDirection === 'DOWN';
  return false;
};

export const evaluateHunterModeDecision = (input: HunterModeEvaluationInput): HunterModeDecision => {
  const defaults = getHunterDefaults(input.config);
  const reasons: string[] = [];
  const blockers: string[] = [];

  const signalScore = Number(input.signal.qualityScore || 0);
  const regime = input.marketState.regime || 'UNKNOWN';
  const spreadBps = deriveSpreadBps(input.marketState);
  const liquidityScore = deriveLiquidityScore(input.marketState);
  const volatilityScore = deriveVolatilityScore(input.marketState);
  const executionConfidence = clamp(Number(input.executionState.executionConfidence || 0), 0, 1);
  const actionType = (input.actionType || 'ENTRY').toUpperCase();

  if (!defaults.hunterModeEnabled) blockers.push('HUNTER_DISABLED');
  if (actionType !== 'ENTRY') blockers.push('UNSUPPORTED_ACTION_TYPE');
  if (signalScore < defaults.hunterMinSignalScore) blockers.push('LOW_SIGNAL_SCORE');
  if (!defaults.hunterAllowedRegimes.includes(regime)) blockers.push('REGIME_NOT_ALLOWED');
  if (spreadBps > defaults.hunterMaxSpreadBps) blockers.push('SPREAD_TOO_WIDE');
  if (liquidityScore < defaults.hunterMinLiquidityScore) blockers.push('LOW_LIQUIDITY');
  if (volatilityScore > defaults.hunterMaxVolatilityScore) blockers.push('VOLATILITY_TOO_HIGH');
  if (!input.executionState.bridgeHealthy) blockers.push('BRIDGE_UNHEALTHY');
  if (executionConfidence < defaults.hunterMinExecutionConfidence) blockers.push('LOW_EXECUTION_CONFIDENCE');
  if (input.riskState.controlMode !== 'NORMAL') blockers.push('CONTROL_MODE_NOT_NORMAL');
  if (input.riskState.riskPressureHigh) blockers.push('RISK_PRESSURE_HIGH');
  if (input.riskState.drawdownBrakeActive) blockers.push('DRAWDOWN_BRAKE_ACTIVE');
  if (input.riskState.emergencyProtectionActive) blockers.push('EMERGENCY_PROTECTION_ACTIVE');
  if (defaults.hunterDisableDuringDrawdown && input.accountState.drawdownPercent >= defaults.hunterDrawdownThreshold) {
    blockers.push('DRAWDOWN_TOO_HIGH');
  }
  if (input.accountState.activeHunterTrades >= defaults.hunterMaxConcurrentHunterTrades) {
    blockers.push('MAX_HUNTER_CONCURRENCY_REACHED');
  }

  const normalizedSignal = clamp(signalScore / 100, 0, 1);
  const normalizedLiquidity = clamp(liquidityScore / 100, 0, 1);
  const normalizedVolatility = clamp(1 - volatilityScore / 100, 0, 1);
  const normalizedSpread = clamp(1 - spreadBps / Math.max(defaults.hunterMaxSpreadBps, 1), 0, 1);
  const normalizedExecution = executionConfidence;

  const score = Math.round((
    normalizedSignal * 0.35 +
    normalizedLiquidity * 0.2 +
    normalizedVolatility * 0.15 +
    normalizedSpread * 0.15 +
    normalizedExecution * 0.15
  ) * 100);

  reasons.push(`signal=${signalScore}`);
  reasons.push(`regime=${regime}`);
  reasons.push(`spreadBps=${spreadBps.toFixed(2)}`);
  reasons.push(`liquidityScore=${liquidityScore}`);
  reasons.push(`volatilityScore=${volatilityScore}`);
  reasons.push(`executionConfidence=${executionConfidence.toFixed(2)}`);

  const continuation = inferContinuation(input.signal, input.marketState);
  const allowAddOnEntry = Boolean(defaults.hunterAllowAddOnEntry && continuation && signalScore >= defaults.hunterMinSignalScore + 5);
  const maxWaveTradesOverride = Math.max(
    Number(input.config.maxTradesPerWave || 1),
    Math.min(defaults.hunterMaxConcurrentHunterTrades, Number(input.config.maxTradesPerWave || 1) + 1)
  );

  const modifiers: HunterModeModifiers = {
    sizeMultiplier: clamp(defaults.hunterSizeMultiplier, 1, 2),
    targetMultiplier: clamp(defaults.hunterTargetMultiplier, 1, 2),
    trailingMode: 'SMART_RELAXED',
    allowAddOnEntry,
    allowReentry: Boolean(defaults.hunterAllowReentry),
    cooldownOverride: Math.max(0, defaults.hunterCooldownSeconds),
    maxWaveTradesOverride,
  };

  const enabled = blockers.length === 0;

  return {
    enabled,
    score,
    reasons,
    blockers,
    modifiers,
  };
};

class HunterModeService {
  private history: HunterModeDecisionRecord[] = [];
  private rejectionByReason: Record<string, number> = {};
  private enabledEvaluations = 0;
  private rejectedEvaluations = 0;
  private totalHunterTrades = 0;
  private activeHunterTrades = 0;

  public evaluateHunterMode(input: HunterModeEvaluationInput): HunterModeDecision {
    return evaluateHunterModeDecision(input);
  }

  public recordDecision(record: HunterModeDecisionRecord): void {
    this.history.push(JSON.parse(JSON.stringify(record)));
    if (this.history.length > 300) this.history.shift();

    if (record.decision.enabled) {
      this.enabledEvaluations++;
    } else {
      this.rejectedEvaluations++;
      for (const blocker of record.decision.blockers) {
        this.rejectionByReason[blocker] = (this.rejectionByReason[blocker] || 0) + 1;
      }
    }
  }

  public registerHunterTradeOpened(): void {
    this.totalHunterTrades++;
    this.activeHunterTrades++;
  }

  public registerHunterTradeClosed(): void {
    this.activeHunterTrades = Math.max(0, this.activeHunterTrades - 1);
  }

  public registerCloseAll(): void {
    this.activeHunterTrades = 0;
  }

  public getActiveHunterTrades(): number {
    return this.activeHunterTrades;
  }

  public getSnapshot(): HunterModeSnapshot {
    return {
      enabledEvaluations: this.enabledEvaluations,
      rejectedEvaluations: this.rejectedEvaluations,
      totalEvaluations: this.enabledEvaluations + this.rejectedEvaluations,
      totalHunterTrades: this.totalHunterTrades,
      activeHunterTrades: this.activeHunterTrades,
      rejectionByReason: { ...this.rejectionByReason },
      lastDecision: this.history.length > 0 ? this.history[this.history.length - 1] : null,
      updatedAt: new Date().toISOString(),
    };
  }

  public getLastDecisions(limit: number = 30): HunterModeDecisionRecord[] {
    return this.history.slice(-limit);
  }

  public ingestExternalDecision(record: HunterModeDecisionRecord): void {
    this.recordDecision(record);
  }

  public reset(): void {
    this.history = [];
    this.rejectionByReason = {};
    this.enabledEvaluations = 0;
    this.rejectedEvaluations = 0;
    this.totalHunterTrades = 0;
    this.activeHunterTrades = 0;
  }
}

export const hunterModeService = new HunterModeService();
