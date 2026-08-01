import { ExecutionStyle } from './ExecutionStyleService';
import { executionStyleService } from './ExecutionStyleService';
import { adaptiveDecisionMemoryService } from './AdaptiveDecisionMemoryService';

export type SignalQualityContext = {
  baseQualityScore: number;
  volatilityRegime?: 'LOW' | 'MEDIUM' | 'HIGH' | string;
  executionPenaltyFactor?: number | null;
  stressScenarioEnabled?: boolean;
  zScoreAbs?: number | null;
  regime?: string;
  hurstExponent?: number | null;
  toxicityScore?: number | null;
  estimatedSlippage?: number | null;
  microstructureRisk?: number | null;
  tailRiskPenalty?: number | null;
  cvarUsed?: number | null;
  realizedVolatilityUsed?: number | null;
  signalStrength?: number | null;
  sizingConfidenceOverride?: number | null;
  crowdingRisk?: 'LOW' | 'MEDIUM' | 'HIGH';
  concentrationRisk?: 'LOW' | 'MEDIUM' | 'HIGH';
  regimeConflict?: boolean;
  executionRisk?: 'LOW' | 'MEDIUM' | 'HIGH';
};

export type SignalQualityBreakdown = {
  baseQualityScore: number;
  regimeAdjustment: number;
  executionAdjustment: number;
  stressAdjustment: number;
  zScoreAdjustment: number;
  finalQualityScore: number;
};

export type CompositeDecision = {
  compositeScore: number;
  regimeCompatibility: number;
  microstructureToxicity: number;
  executionConfidence: number;
  tailRiskPenalty: number;
  recommendedExecutionStyle: ExecutionStyle;
  sizingConfidence: number;
  noTradeReason?: string;
  regimePolicy?: 'ALLOW' | 'STAGGER' | 'DELAY' | 'BLOCK';
  crowdingRisk?: 'LOW' | 'MEDIUM' | 'HIGH';
  concentrationRisk?: 'LOW' | 'MEDIUM' | 'HIGH';
  executionRisk?: 'LOW' | 'MEDIUM' | 'HIGH';
  regimeAdjustedConfidence?: number;
  strategyRegimeEdgeScore?: number;
  executionStyleEffectivenessScore?: number;
  blockedOpportunityPenalty?: number;
  adaptiveMemoryContext?: any;
  adaptiveMemoryDiagnostics?: any;
};

export type CompositeDecisionContext = SignalQualityContext;

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const clamp0to100 = (value: number) => Math.max(0, Math.min(100, value));

export function evaluateSignalQuality(context: SignalQualityContext): SignalQualityBreakdown {
  let finalScore = context.baseQualityScore;
  
  // Regime adjustment
  let regimeAdjustment = 0;
  if (context.volatilityRegime === 'LOW') regimeAdjustment = 3;
  else if (context.volatilityRegime === 'HIGH') regimeAdjustment = -5;
  
  // Execution adjustment
  let executionAdjustment = 0;
  if (context.executionPenaltyFactor !== undefined && context.executionPenaltyFactor !== null && context.executionPenaltyFactor < 1) {
    executionAdjustment = -Math.round((1 - context.executionPenaltyFactor) * 10);
  }
  
  // Stress adjustment
  let stressAdjustment = 0;
  if (context.stressScenarioEnabled) {
    stressAdjustment = -3;
  }
  
  // Z-Score adjustment
  let zScoreAdjustment = 0;
  if (context.zScoreAbs !== undefined && context.zScoreAbs !== null) {
    if (context.zScoreAbs >= 2 && context.zScoreAbs < 3) {
      zScoreAdjustment = 2;
    } else if (context.zScoreAbs >= 3) {
      zScoreAdjustment = 3;
    }
  }
  
  finalScore = finalScore + regimeAdjustment + executionAdjustment + stressAdjustment + zScoreAdjustment;
  
  // Clamp [0, 100]
  finalScore = Math.max(0, Math.min(100, finalScore));
  
  return {
    baseQualityScore: context.baseQualityScore,
    regimeAdjustment,
    executionAdjustment,
    stressAdjustment,
    zScoreAdjustment,
    finalQualityScore: finalScore
  };
}

export function buildCompositeDecision(context: CompositeDecisionContext): CompositeQualityDecision {
  const breakdown = evaluateSignalQuality(context);
  const baseScore = breakdown.finalQualityScore;
  const regime = context.regime || 'UNKNOWN';
  const hurst = context.hurstExponent !== undefined && context.hurstExponent !== null ? context.hurstExponent : 0.5;
  const toxicity = clamp01((context.toxicityScore ?? 0) / 100);
  const slippagePenalty = context.estimatedSlippage !== undefined && context.estimatedSlippage !== null
    ? clamp01(context.estimatedSlippage / 2)
    : 0;
  const microstructureRisk = clamp01(context.microstructureRisk ?? 0);
  const tailRiskPenalty = context.tailRiskPenalty !== undefined && context.tailRiskPenalty !== null
    ? clamp01(context.tailRiskPenalty)
    : (context.cvarUsed !== undefined && context.cvarUsed !== null && context.cvarUsed < 0 ? clamp01(Math.abs(context.cvarUsed)) : 0);

  let regimeCompatibility = 0.7;
  if (regime === 'MOMENTUM_TREND' || regime === 'TREND') {
    regimeCompatibility = hurst > 0.5 ? 0.9 : 0.75;
  } else if (regime === 'MEAN_REVERSION' || regime === 'LOW_VOLATILITY') {
    regimeCompatibility = hurst < 0.5 ? 0.9 : 0.62;
  } else if (regime === 'CHOPPY/NOISE' || regime === 'NOISE' || regime === 'CHOPPY') {
    regimeCompatibility = 0.3;
  } else if (regime === 'HIGH_VOLATILITY' || regime === 'VOLATILITY_SHOCK') {
    regimeCompatibility = 0.6;
  }

  const microstructureToxicity = clamp01(toxicity + slippagePenalty + microstructureRisk * 0.5);
  const executionConfidence = clamp01((baseScore / 100) * 0.6 + regimeCompatibility * 0.25 + (1 - microstructureToxicity) * 0.15);
  const sizingConfidence = clamp01((context.sizingConfidenceOverride !== undefined && context.sizingConfidenceOverride !== null
    ? context.sizingConfidenceOverride
    : 0.7) - tailRiskPenalty * 0.35 - microstructureToxicity * 0.25);
  const adaptiveMemoryContext = {
    strategy: (context as any).strategy || 'UNKNOWN',
    regime,
    executionStyle: (context as any).executionStyle || 'MID',
    asset: (context as any).asset || 'UNKNOWN',
    direction: (context as any).direction || 'LONG'
  };
  const adaptiveMemorySummary = adaptiveDecisionMemoryService.getMemorySummary(adaptiveMemoryContext);
  const regimeAdjustedConfidence = adaptiveMemorySummary.regimeAdjustedConfidence;
  const strategyRegimeEdgeScore = adaptiveMemorySummary.strategyRegimeEdgeScore;
  const executionStyleEffectivenessScore = adaptiveMemorySummary.executionStyleEffectivenessScore;
  const blockedOpportunityPenalty = adaptiveMemorySummary.blockedOpportunityPenalty;
  const adaptiveMemoryDiagnostics = {
    persistentMemorySummary: {
      hasHistory: adaptiveMemorySummary.hasHistory,
      count: adaptiveMemorySummary.count,
      decayAdjustedStrategyEdge: adaptiveMemorySummary.decayAdjustedStrategyEdge,
      calibrationDrift: adaptiveMemorySummary.calibrationDrift,
      blockedAlphaSaved: adaptiveMemorySummary.blockedAlphaSaved,
      blockedAlphaLost: adaptiveMemorySummary.blockedAlphaLost,
      topRejectedReasons: adaptiveMemorySummary.topRejectedReasons,
      executionStylePolicyDiagnostics: adaptiveMemorySummary.executionStylePolicyDiagnostics
    }
  };
  const calibratedExecutionConfidence = clamp01(executionConfidence * 0.7 + regimeAdjustedConfidence * 0.3);
  const calibratedSizingConfidence = clamp01(sizingConfidence * 0.7 + strategyRegimeEdgeScore * 0.3);
  const calibratedExecutionStyleScore = clamp01((executionStyleEffectivenessScore + strategyRegimeEdgeScore) / 2);
  const styleContext = {
    signalQualityScore: baseScore,
    volatilityRegime: regime,
    stressScenarioEnabled: context.stressScenarioEnabled ?? false,
    tailRiskMode: tailRiskPenalty > 0.6 ? 'TAIL_RISK' : 'NORMAL',
    drawdownMode: 'NORMAL'
  };
  let recommendedExecutionStyle: ExecutionStyle = executionStyleService.decideStyle(styleContext);

  let compositeScore = clamp0to100(
    baseScore * 0.35 + regimeCompatibility * 100 * 0.2 + calibratedExecutionConfidence * 100 * 0.25 + calibratedSizingConfidence * 100 * 0.2
  );
  if (tailRiskPenalty > 0.6) compositeScore -= 15;
  if (context.regimeConflict) compositeScore -= 8;
  if (blockedOpportunityPenalty > 0.45) compositeScore -= 6;
  compositeScore = clamp0to100(compositeScore);

  let noTradeReason: string | undefined;
  let regimePolicy: CompositeDecision['regimePolicy'] = 'ALLOW';
  const regimeConflict = Boolean(context.regimeConflict);
  if (regimeCompatibility < 0.35 || microstructureToxicity > 0.75) {
    noTradeReason = 'REGIME_CONFLICT';
    regimePolicy = 'BLOCK';
  } else if (regime === 'CHOPPY/NOISE' || regime === 'NOISE' || regime === 'CHOPPY') {
    regimePolicy = 'STAGGER';
  } else if (microstructureToxicity > 0.55 || tailRiskPenalty > 0.65) {
    noTradeReason = 'TAIL_RISK';
    regimePolicy = 'DELAY';
  }
  if (context.executionRisk === 'HIGH' && !noTradeReason) {
    noTradeReason = 'EXECUTION_RISK';
    regimePolicy = 'DELAY';
  }
  if (blockedOpportunityPenalty > 0.6 && !noTradeReason) {
    noTradeReason = 'CROWDING';
    regimePolicy = 'DELAY';
  }
  if (regimeConflict && !noTradeReason) {
    noTradeReason = 'REGIME_CONFLICT';
    regimePolicy = 'BLOCK';
  }

  if (calibratedExecutionStyleScore > 0.7 && context.executionRisk !== 'HIGH') {
    recommendedExecutionStyle = 'AGGRESSIVE';
  } else if (calibratedExecutionStyleScore > 0.45) {
    recommendedExecutionStyle = 'MID';
  } else {
    recommendedExecutionStyle = 'PASSIVE';
  }

  return {
    compositeScore,
    regimeCompatibility,
    microstructureToxicity,
    executionConfidence: calibratedExecutionConfidence,
    tailRiskPenalty,
    recommendedExecutionStyle,
    sizingConfidence: calibratedSizingConfidence,
    noTradeReason,
    regimePolicy,
    crowdingRisk: context.crowdingRisk,
    concentrationRisk: context.concentrationRisk,
    executionRisk: context.executionRisk,
    regimeAdjustedConfidence,
    strategyRegimeEdgeScore,
    executionStyleEffectivenessScore,
    blockedOpportunityPenalty,
    adaptiveMemoryContext,
    adaptiveMemoryDiagnostics
  };
}

export type CompositeQualityDecision = CompositeDecision;
