import { logStructured } from '../utils/logger';
import { calculateRealizedVolatility, riskManagement } from '../quant/riskManagement';

export interface PositionSizingInput {
    asset: string;
    direction: 'LONG' | 'SHORT';
    signalStrength?: number;      // 0 to 1, or raw score 0-100
    volatilityProxy?: number;     // e.g. volRatio
    microstructureRisk?: number;  // derived from OBI, OFI, toxicity (0 to 1)
    regime?: string;              // e.g. TREND, CHOPPY, NOISE
    baseConfigSize: number;       // current per-trade size from config
    hunterMode: boolean;
    institutionalRiskCap?: number;
    prices?: number[];
    returns?: number[];
    cvar?: number;
    realizedVolatility?: number;
    cvarConfidenceLevel?: number;
    correlationMultiplier?: number; // Cross-asset correlation multiplier (0 to 1)
}

export interface PositionSizingOutput {
    recommendedSize: number;
    baseSize: number;
    sizeFactor: number;
    clampedByRisk: boolean;
    clampedByVolatility: boolean;
    clampedByMicrostructure: boolean;
    clampedByTailRisk: boolean;
    clampedByCorrelation: boolean;
    cvarUsed: number;
    realizedVolatilityUsed: number;
    sizingReason: string;
}

export class PositionSizingEngine {
    public calculateSize(input: PositionSizingInput): PositionSizingOutput {
        const {
            asset,
            direction,
            signalStrength = 50,
            volatilityProxy = 1.0,
            microstructureRisk = 0.5,
            regime = 'NEUTRAL',
            baseConfigSize,
            hunterMode,
            institutionalRiskCap,
            prices,
            returns,
            cvar,
            realizedVolatility,
            cvarConfidenceLevel = 0.95,
            correlationMultiplier = 1.0
        } = input;

        let sizeFactor = 1.0;
        let clampedByRisk = false;
        let clampedByVolatility = false;
        let clampedByMicrostructure = false;
        let clampedByTailRisk = false;
        let clampedByCorrelation = false;
        let sizingReason = 'baseline';

        const normStrength = Math.min(Math.max(signalStrength / 100, 0), 1);
        const rvInput = typeof realizedVolatility === 'number' ? realizedVolatility : calculateRealizedVolatility(prices || [], 20);
        const returnsInput = Array.isArray(returns) && returns.length > 0 ? returns : [];
        const cvarUsed = typeof cvar === 'number' ? cvar : riskManagement.calculateCVaR(returnsInput, cvarConfidenceLevel);

        // 1. Tail risk / CVaR clamp first for safety.
        if (cvarUsed < -0.05) {
            sizeFactor *= 0.6;
            clampedByTailRisk = true;
            sizingReason = 'cvar_tail_risk';
        } else if (cvarUsed < -0.02) {
            sizeFactor *= 0.8;
            clampedByTailRisk = true;
            sizingReason = 'cvar_tail_risk';
        }

        // 2. Volatility-driven sizing based on realized volatility.
        if (rvInput > 0.4) {
            sizeFactor *= 0.55;
            clampedByVolatility = true;
            sizingReason = sizingReason === 'baseline' ? 'realized_volatility' : sizingReason;
        } else if (rvInput > 0.25) {
            sizeFactor *= 0.75;
            clampedByVolatility = true;
            sizingReason = sizingReason === 'baseline' ? 'realized_volatility' : sizingReason;
        } else if (rvInput < 0.08 && normStrength > 0.85 && microstructureRisk < 0.3) {
            sizeFactor += 0.15;
            sizingReason = 'signal_edge';
        }

        // 3. Microstructure risk clamp.
        if (microstructureRisk > 0.9) {
            sizeFactor *= 0.5;
            clampedByMicrostructure = true;
            sizingReason = 'microstructure_risk';
        } else if (microstructureRisk > 0.7) {
            sizeFactor *= 0.7;
            clampedByMicrostructure = true;
            sizingReason = sizingReason === 'baseline' ? 'microstructure_risk' : sizingReason;
        }

        // 4. Regime clamp.
        if (regime === 'CHOPPY/NOISE' || regime === 'NOISE' || regime === 'CHOPPY') {
            sizeFactor *= 0.8;
            clampedByVolatility = true;
            sizingReason = 'regime';
        }

        // 5. Signal strength adjustments only modestly.
        if (normStrength > 0.9 && rvInput < 0.2 && microstructureRisk < 0.2) {
            sizeFactor += 0.2;
            sizingReason = 'strong_signal';
        } else if (normStrength > 0.8 && rvInput < 0.3 && microstructureRisk < 0.4) {
            sizeFactor += 0.1;
            sizingReason = 'signal_edge';
        }

        // 6. Cross-asset correlation multiplier.
        // Applied after all other risk adjustments but before hard caps.
        // correlationMultiplier is computed by CrossAssetCorrelationService
        // and passed in from the ExecutionOrchestrator.
        if (correlationMultiplier !== undefined && correlationMultiplier < 1.0) {
            sizeFactor *= correlationMultiplier;
            clampedByCorrelation = true;
            sizingReason = sizingReason === 'baseline' ? 'correlation_overlay' : sizingReason;
        }

        // 7. Hunter mode adjustments (relax lower bounds slightly, but don't increase leverage).
        if (hunterMode) {
            if (sizeFactor < 0.8) {
                sizeFactor = 0.8;
                clampedByVolatility = false;
                clampedByMicrostructure = false;
                clampedByCorrelation = false;
            }
        }

        // 8. Hard caps/floors.
        if (sizeFactor < 0.25 && !hunterMode) sizeFactor = 0.25;
        if (sizeFactor > 1.5) sizeFactor = 1.5;

        let recommendedSize = baseConfigSize * sizeFactor;

        if (institutionalRiskCap !== undefined && recommendedSize > institutionalRiskCap) {
            recommendedSize = institutionalRiskCap;
            sizeFactor = recommendedSize / baseConfigSize;
            clampedByRisk = true;
            sizingReason = 'institutional_cap';
        }

        recommendedSize = Math.max(0.01, Number(recommendedSize.toFixed(3)));

        const result: PositionSizingOutput = {
            recommendedSize,
            baseSize: baseConfigSize,
            sizeFactor,
            clampedByRisk,
            clampedByVolatility,
            clampedByMicrostructure,
            clampedByTailRisk,
            clampedByCorrelation,
            cvarUsed,
            realizedVolatilityUsed: rvInput,
            sizingReason
        };

        logStructured('QUANT', 'INFO', 'position_sizing_evaluated', `[${asset}] Dynamic size: ${recommendedSize.toFixed(3)} (Factor: ${sizeFactor.toFixed(2)})`, {
            asset,
            direction,
            baseSize: baseConfigSize,
            recommendedSize,
            sizeFactor,
            signalStrength,
            volatilityProxy,
            microstructureRisk,
            regime,
            hunterMode,
            clampedByRisk,
            clampedByVolatility,
            clampedByMicrostructure,
            clampedByTailRisk,
            clampedByCorrelation,
            correlationMultiplier,
            cvarUsed,
            realizedVolatilityUsed: rvInput,
            sizingReason,
            eventVersion: 'SizingEngine_v3',
            service: 'trading-engine',
            component: 'position-sizing',
            timestampUtc: new Date().toISOString()
        });

        return result;
    }
}

export const positionSizingEngine = new PositionSizingEngine();
