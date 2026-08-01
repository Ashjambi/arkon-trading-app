export interface PositionSnapshot {
    direction: 'LONG' | 'SHORT';
    volume: number;
    strength: number;
    openTime: number;
}

export interface EnhancedSignal {
    direction: 'LONG' | 'SHORT';
    strength: number;
    volume: number;
    timestamp: number;
    confidence: number;
}

export interface MarketContext {
    volatility: number;
    trendStrength: number;
    volumeProfile: number;
    reversalProbability?: number;
    vwapDeviation?: number;
    currentBoostCount?: number;
    maxBoosts?: number;
}

export interface TradeAction {
    action: 'FLIP' | 'HEDGE' | 'BOOST' | 'HOLD';
    closeOpposite?: boolean;
    size?: number;
    maxBoosts?: number;
    reason: string;
}

export interface EnhancedExecutionConfig {
    minCooldownMs: number;
    maxCooldownMs: number;
    highVolatilityThreshold: number;
    lowVolatilityThreshold: number;
    flipMinVolumeRatio: number;
    flipMinStrengthRatio: number;
    flipMinConfidence: number;
    hedgeMaxConfidence: number;
    hedgeMaxVolumeRatio: number;
    boostMinMomentum: number;
    boostMinVolumeRatio: number;
    defaultMaxBoosts: number;
}

const defaultConfig: EnhancedExecutionConfig = {
    minCooldownMs: 5 * 60 * 1000,
    maxCooldownMs: 30 * 60 * 1000,
    highVolatilityThreshold: 3,
    lowVolatilityThreshold: 0.5,
    flipMinVolumeRatio: 1.3,
    flipMinStrengthRatio: 1.2,
    flipMinConfidence: 75,
    hedgeMaxConfidence: 60,
    hedgeMaxVolumeRatio: 1.0,
    boostMinMomentum: 0.7,
    boostMinVolumeRatio: 1.5,
    defaultMaxBoosts: 3,
};

export class EnhancedExecutionEngine {
    constructor(private readonly config: EnhancedExecutionConfig = defaultConfig) {}

    decideAction(
        currentPosition: PositionSnapshot,
        newSignal: EnhancedSignal,
        marketContext: MarketContext
    ): TradeAction {
        const timeSinceLastTrade = Date.now() - currentPosition.openTime;
        const cooldownPeriod = this.getCooldownPeriod(marketContext.volatility);

        if (timeSinceLastTrade < cooldownPeriod) {
            return { action: 'HOLD', reason: 'COOLDOWN_ACTIVE' };
        }

        const volatilityAdjustedSize = this.calculateVolAdjustedSize(
            newSignal.volume,
            marketContext.volatility
        );

        const safeCurrentVolume = Math.max(0.0001, currentPosition.volume);
        const safeCurrentStrength = Math.max(1, currentPosition.strength);
        const volumeRatio = newSignal.volume / safeCurrentVolume;
        const strengthRatio = newSignal.strength / safeCurrentStrength;

        if (newSignal.direction !== currentPosition.direction) {
            if (
                volumeRatio > this.config.flipMinVolumeRatio &&
                strengthRatio > this.config.flipMinStrengthRatio &&
                newSignal.confidence > this.config.flipMinConfidence
            ) {
                return {
                    action: 'FLIP',
                    closeOpposite: true,
                    size: volatilityAdjustedSize,
                    reason: 'STRONG_REVERSAL_SIGNAL',
                };
            }

            if (
                newSignal.confidence < this.config.hedgeMaxConfidence ||
                volumeRatio <= this.config.hedgeMaxVolumeRatio
            ) {
                return {
                    action: 'HEDGE',
                    closeOpposite: false,
                    size: volatilityAdjustedSize * 0.5,
                    reason: 'DEFENSIVE_HEDGE',
                };
            }
        }

        if (newSignal.direction === currentPosition.direction) {
            const momentumScore = this.calculateMomentum(marketContext);
            const maxBoosts = marketContext.maxBoosts ?? this.config.defaultMaxBoosts;
            const boostCount = marketContext.currentBoostCount || 0;

            if (boostCount >= maxBoosts) {
                return { action: 'HOLD', reason: 'MAX_BOOSTS_REACHED' };
            }

            if (momentumScore > this.config.boostMinMomentum && volumeRatio > this.config.boostMinVolumeRatio) {
                return {
                    action: 'BOOST',
                    size: volatilityAdjustedSize,
                    maxBoosts,
                    reason: 'MOMENTUM_BOOST',
                };
            }
        }

        return { action: 'HOLD', reason: 'NO_CLEAR_SIGNAL' };
    }

    getCooldownPeriod(volatility: number): number {
        const normalizedVol = Math.max(0, Number(volatility || 0));
        if (normalizedVol >= this.config.highVolatilityThreshold) {
            return this.config.minCooldownMs;
        }
        if (normalizedVol <= this.config.lowVolatilityThreshold) {
            return this.config.maxCooldownMs;
        }

        const range = this.config.highVolatilityThreshold - this.config.lowVolatilityThreshold;
        const ratio = (normalizedVol - this.config.lowVolatilityThreshold) / Math.max(0.0001, range);
        const inverted = 1 - Math.max(0, Math.min(1, ratio));
        return Math.round(this.config.minCooldownMs + inverted * (this.config.maxCooldownMs - this.config.minCooldownMs));
    }

    calculateVolAdjustedSize(volume: number, volatility: number): number {
        const safeVolume = Math.max(0.01, Number(volume || 0));
        const vol = Math.max(0, Number(volatility || 0));

        let multiplier = 1;
        if (vol >= this.config.highVolatilityThreshold) {
            multiplier = 0.7;
        } else if (vol <= this.config.lowVolatilityThreshold) {
            multiplier = 1.15;
        }

        return Number((safeVolume * multiplier).toFixed(4));
    }

    calculateMomentum(marketContext: MarketContext): number {
        const trendStrength = Math.max(0, Math.min(1, Number(marketContext.trendStrength || 0)));
        const volumeComponent = Math.max(0, Math.min(1, Number(marketContext.volumeProfile || 0) / 100));
        const reversalPenalty = Math.max(0, Math.min(1, Number(marketContext.reversalProbability || 0) / 100));

        const momentumScore = trendStrength * 0.55 + volumeComponent * 0.35 + (1 - reversalPenalty) * 0.1;
        return Math.max(0, Math.min(1, Number(momentumScore.toFixed(4))));
    }
}

export const enhancedExecutionEngine = new EnhancedExecutionEngine();
