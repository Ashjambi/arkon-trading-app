import { logStructured } from '../utils/logger';

export interface ExecutionQualityInput {
  asset: string;
  direction: 'LONG' | 'SHORT';
  recommendedSize: number;
  orderBookImbalance?: number | null;
  microPrice?: number | null;
  microPriceDeviation?: number | null;
  topLevelImbalance?: number | null;
  depthPressure?: number | null;
  normalizedOfi?: number | null;
  toxicityMetric?: number | null;
  volatilityProxy?: number | null;
  regime?: string;
  hunterMode: boolean;
}

export interface ExecutionQualityOutput {
  executionMode: 'NORMAL' | 'PASSIVE' | 'PRICE_IMPROVED' | 'DELAYED' | 'SKIP';
  referencePrice?: number | null;
  executionPenaltyFactor: number;
  shouldDelay: boolean;
  shouldSkip: boolean;
  reason: string;
}

export class ExecutionQualityEngine {
  public evaluate(input: ExecutionQualityInput): ExecutionQualityOutput {
    let executionMode: 'NORMAL' | 'PASSIVE' | 'PRICE_IMPROVED' | 'DELAYED' | 'SKIP' = 'NORMAL';
    let executionPenaltyFactor = 1.0;
    let shouldDelay = false;
    let shouldSkip = false;
    let reason = "Neutral microstructure";
    let referencePrice = input.microPrice || null;

    const {
        asset,
        direction,
        hunterMode,
        toxicityMetric = 0,
        depthPressure = 0,
        normalizedOfi = 0,
        volatilityProxy = 1.0,
        microPriceDeviation = 0
    } = input;

    const flowDirection = direction === 'LONG' ? 1 : -1;
    const adverseNofi = normalizedOfi !== null && normalizedOfi !== undefined ? -(normalizedOfi * flowDirection) : 0;
    const adverseDepth = depthPressure !== null && depthPressure !== undefined ? -(depthPressure * flowDirection) : 0;
    const tox = toxicityMetric !== null && toxicityMetric !== undefined ? toxicityMetric : 0;
    
    if (tox > 0.9 && adverseNofi > 0.8 && adverseDepth > 0.8) {
        executionMode = 'SKIP';
        shouldSkip = true;
        reason = "Extreme microstructure hostility: max toxicity, adverse flow and depth";
        executionPenaltyFactor = 0.0;
    } else if (tox > 0.8 && adverseNofi > 0.7) {
        executionMode = 'DELAYED';
        shouldDelay = true;
        reason = "Strong microstructure hostility: high toxicity and adverse flow";
        executionPenaltyFactor = 0.5;
        if (hunterMode) {
            shouldDelay = false;
            executionMode = 'PASSIVE';
            reason = "Hunter Mode: downgraded from DELAYED to PASSIVE due to strong hostility";
        }
    } else if (tox > 0.6 || adverseNofi > 0.5 || adverseDepth > 0.6) {
        executionMode = 'PASSIVE';
        executionPenaltyFactor = 0.8;
        reason = "Elevated microstructure risks (toxicity, flow, or depth)";
    } else if (microPriceDeviation !== null && microPriceDeviation !== undefined && Math.abs(microPriceDeviation) > 0.0001) {
        executionMode = 'PRICE_IMPROVED';
        reason = "Microprice provides a better reference entry";
    }

    const output: ExecutionQualityOutput = {
        executionMode,
        referencePrice,
        executionPenaltyFactor,
        shouldDelay,
        shouldSkip,
        reason
    };

    logStructured('QUANT', 'INFO', shouldSkip ? 'execution_quality_skipped' : shouldDelay ? 'execution_quality_downgraded' : 'execution_quality_evaluated', `[${asset}] Execution Quality: ${executionMode} (${reason})`, {
        ...input,
        ...output,
        eventVersion: 'ExecQ_v1',
        service: 'trading-engine',
        component: 'execution-quality',
        timestampUtc: new Date().toISOString()
    });

    return output;
  }
}

export const executionQualityEngine = new ExecutionQualityEngine();
