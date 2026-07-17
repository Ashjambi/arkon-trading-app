export type SignalQualityContext = {
  baseQualityScore: number;
  volatilityRegime?: 'LOW' | 'MEDIUM' | 'HIGH';
  executionPenaltyFactor?: number | null;
  stressScenarioEnabled?: boolean;
  zScoreAbs?: number | null;
};

export type SignalQualityBreakdown = {
  baseQualityScore: number;
  regimeAdjustment: number;
  executionAdjustment: number;
  stressAdjustment: number;
  zScoreAdjustment: number;
  finalQualityScore: number;
};

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
