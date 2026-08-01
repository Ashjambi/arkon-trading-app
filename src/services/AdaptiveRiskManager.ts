export type AdaptiveMarketRegime = 'TRENDING' | 'RANGING' | 'VOLATILE';

export interface AdaptiveRiskOptions {
    maxExposurePct?: number;
}

export class AdaptiveRiskManager {
    calculatePositionSize(
        accountBalance: number,
        signalConfidence: number,
        marketVolatility: number,
        correlationMatrix: number[][],
        options: AdaptiveRiskOptions = {}
    ): number {
        const safeBalance = Math.max(0, Number(accountBalance || 0));
        if (safeBalance <= 0) return 0;

        const baseKelly = this.kellyFraction(signalConfidence);
        const safeVolatility = Math.max(0, Number(marketVolatility || 0));
        const volatilityFactor = 1 / (1 + safeVolatility * 2);
        const diversificationFactor = this.calculateDiversificationBenefit(correlationMatrix);
        const maxExposurePct = Math.max(0.01, Math.min(0.3, Number(options.maxExposurePct ?? 0.15)));

        const maxExposure = Math.min(
            safeBalance * maxExposurePct,
            safeBalance * baseKelly * volatilityFactor * diversificationFactor
        );

        return Math.max(0, Number(maxExposure));
    }

    calculateDynamicStopLoss(
        entryPrice: number,
        direction: 'LONG' | 'SHORT',
        atr: number,
        marketRegime: AdaptiveMarketRegime
    ): { stopLoss: number; takeProfit: number } {
        const safeEntry = Math.max(0.000001, Number(entryPrice || 0));
        const safeAtr = Math.max(Number(atr || 0), safeEntry * 0.001);

        const multipliers: Record<AdaptiveMarketRegime, { sl: number; tp: number }> = {
            TRENDING: { sl: 2.0, tp: 4.0 },
            RANGING: { sl: 1.5, tp: 2.5 },
            VOLATILE: { sl: 3.0, tp: 6.0 },
        };

        const m = multipliers[marketRegime];

        return {
            stopLoss: direction === 'LONG'
                ? safeEntry - safeAtr * m.sl
                : safeEntry + safeAtr * m.sl,
            takeProfit: direction === 'LONG'
                ? safeEntry + safeAtr * m.tp
                : safeEntry - safeAtr * m.tp,
        };
    }

    kellyFraction(signalConfidence: number): number {
        const p = Math.max(0, Math.min(1, Number(signalConfidence || 0) / 100));
        const b = 1.5;
        const rawKelly = p - (1 - p) / b;
        return Math.max(0, Math.min(0.25, rawKelly));
    }

    calculateDiversificationBenefit(correlationMatrix: number[][]): number {
        if (!Array.isArray(correlationMatrix) || correlationMatrix.length < 2) {
            return 1;
        }

        let sumAbsCorr = 0;
        let pairs = 0;

        for (let i = 0; i < correlationMatrix.length; i++) {
            for (let j = i + 1; j < correlationMatrix[i].length; j++) {
                const value = Number(correlationMatrix[i][j]);
                if (Number.isFinite(value)) {
                    sumAbsCorr += Math.abs(value);
                    pairs += 1;
                }
            }
        }

        if (pairs === 0) return 1;

        const avgAbsCorr = sumAbsCorr / pairs;
        const factor = 1 + (1 - avgAbsCorr) * 0.4;
        return Math.max(0.6, Math.min(1.4, factor));
    }
}

export const adaptiveRiskManager = new AdaptiveRiskManager();
