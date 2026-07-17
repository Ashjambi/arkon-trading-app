import { logStructured } from '../utils/logger';

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
}

export interface PositionSizingOutput {
    recommendedSize: number;
    baseSize: number;
    sizeFactor: number;
    clampedByRisk: boolean;
    clampedByVolatility: boolean;
    clampedByMicrostructure: boolean;
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
            institutionalRiskCap
        } = input;

        let sizeFactor = 1.0;
        let clampedByRisk = false;
        let clampedByVolatility = false;
        let clampedByMicrostructure = false;

        // 1. Adjust upward modestly when signalStrength is high
        const normStrength = Math.min(Math.max(signalStrength / 100, 0), 1); // assuming 0-100
        if (normStrength > 0.9 && volatilityProxy < 1.0 && microstructureRisk < 0.2) {
            sizeFactor += 0.4;
        } else if (normStrength > 0.8 && volatilityProxy < 1.2 && microstructureRisk < 0.4) {
            sizeFactor += 0.2; // Modest increase
        }

        // 2. Adjust downward when volatility is high
        if (volatilityProxy > 2.0) {
            sizeFactor *= 0.5;
            clampedByVolatility = true;
        } else if (volatilityProxy > 1.5) {
            sizeFactor *= 0.7;
            clampedByVolatility = true;
        }

        // 3. Adjust downward when microstructure risk is high
        if (microstructureRisk > 0.9) {
            sizeFactor *= 0.5;
            clampedByMicrostructure = true;
        } else if (microstructureRisk > 0.7) {
            sizeFactor *= 0.7;
            clampedByMicrostructure = true;
        }

        // 4. Adjust for regime
        if (regime === 'CHOPPY/NOISE' || regime === 'NOISE' || regime === 'CHOPPY') {
            sizeFactor *= 0.8;
            clampedByVolatility = true; // reusing this flag or could add clampedByRegime
        }

        // 5. Hunter mode adjustments (relax lower bounds slightly, but don't increase leverage)
        if (hunterMode) {
            // Ensure minimum sizing factor so we still get fills during choppy hunting
            if (sizeFactor < 0.8) {
                sizeFactor = 0.8;
                clampedByVolatility = false;
                clampedByMicrostructure = false;
            }
        }

        // 6. Hard caps
        // Keep sizeFactor strictly between 0.5 and 1.5 under normal conditions
        if (sizeFactor < 0.5 && !hunterMode) sizeFactor = 0.5;
        if (sizeFactor > 1.5) sizeFactor = 1.5;

        let recommendedSize = baseConfigSize * sizeFactor;

        // Apply institutional risk cap
        if (institutionalRiskCap !== undefined && recommendedSize > institutionalRiskCap) {
            recommendedSize = institutionalRiskCap;
            sizeFactor = recommendedSize / baseConfigSize;
            clampedByRisk = true;
        }

        // Round up to avoid tiny sizes, precision logic
        recommendedSize = Math.max(0.01, Number(recommendedSize.toFixed(3)));

        const result: PositionSizingOutput = {
            recommendedSize,
            baseSize: baseConfigSize,
            sizeFactor,
            clampedByRisk,
            clampedByVolatility,
            clampedByMicrostructure
        };

        // Emit log
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
            eventVersion: 'SizingEngine_v1',
            service: 'trading-engine',
            component: 'position-sizing',
            timestampUtc: new Date().toISOString()
        });

        return result;
    }
}

export const positionSizingEngine = new PositionSizingEngine();
