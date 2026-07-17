import { positionSizingEngine, PositionSizingInput } from '../PositionSizingEngine';
import { TradingSignal, SignalDirection, SignalStrength, MarketAnalysisState, AppConfig } from '../../types';
import { BaseStrategy } from "./BaseStrategy";
import { calculateInstitutionalRisk } from "./ScoringUtils";
import { logStructured } from '../../utils/logger';

const COINT_FISHER_HOSTILITY_THRESHOLD = 1.5;
const COINT_MAX_SAFE_DVOL = 85;

export class CointegrationStrategy implements BaseStrategy {
    validate(state: MarketAnalysisState, config: AppConfig) {
        // We need allSummaries to compare with the correlated asset
        if (!state.allSummaries || state.allSummaries.length < 2) {
            return { passed: false, score: 0 };
        }

        const isBTC = state.asset.includes('BTC');
        const isETH = state.asset.includes('ETH');
        
        if (!isBTC && !isETH) {
            return { passed: false, score: 0 }; // Only trade BTC/ETH pairs for cointegration
        }

        // Find the correlated asset's summary
        const targetAsset = isBTC ? 'ETH' : 'BTC';
        const correlatedSummary = state.allSummaries.find(s => s.instrument_name && s.instrument_name.includes(targetAsset));
        
        if (!correlatedSummary) {
            return { passed: false, score: 0 };
        }

        // We don't have the exact VWAP of the other asset in summary, 
        // but we can use the funding rate or just rely on the current asset's VWAP deviation 
        // combined with a high correlation regime.
        // For a true pairs trade, we compare the funding rates and VWAP deviations.
        
        let score = 0;
        const vwapDevAbs = Math.abs(state.vwapDeviation) * 100;
        const fundingDiff = state.fundingRate - (correlatedSummary.funding_8h || 0);
        
        // If our asset is overvalued (positive VWAP dev) and has higher funding rate, it's a strong short signal
        // If our asset is undervalued (negative VWAP dev) and has lower funding rate, it's a strong long signal
        const isAligned = (state.vwapDeviation > 0 && fundingDiff > 0) || (state.vwapDeviation < 0 && fundingDiff < 0);
        
        const gates = config.strategyGates?.['COINTEGRATION'];
        const vwapThreshold = gates ? gates.vwapZScore : (config.vwapZScore || 2.0);

        // Score based on VWAP deviation
        if (vwapDevAbs >= vwapThreshold) {
            score += 40;
        } else if (vwapDevAbs >= vwapThreshold * 0.5) {
            score += 20;
        }

        // Align with Orchestrator's Strong Cointegration Divergence logic
        const isStrongDivergence = state.rSquared > 0.7 && Math.abs(state.vwapDeviation) > 0.01;
        if (isStrongDivergence) {
            score += 20;
        }

        if (isAligned && Math.abs(fundingDiff) > 0.0001) {
            score += 15; // Extra points for funding rate divergence aligning with VWAP divergence
        }

        const rSquaredThreshold = gates ? gates.rSquared : config.rSquared;
        if (state.rSquared > rSquaredThreshold) {
            score += 15;
        }

        const toxicityThreshold = gates ? gates.toxicity : config.toxicity;
        if (state.toxicityScore < toxicityThreshold) {
            score += 10;
        }

        const effectiveThreshold = config.hunterMode 
          ? Math.max(0, (config.minSignalScore || 80) - 20) 
          : (config.minSignalScore || 80);
        const isRegimeValid = (state.regime === 'MEAN_REVERSION' || state.regime === 'CHOPPY/NOISE');
        
        const direction = state.vwapDeviation > 0 ? SignalDirection.SHORT : SignalDirection.LONG;
        
        // S-102: Trend Hostility Filter
        // If we are fading a very strong trend, reject the cointegration signal
        const isHostileTrend = (direction === SignalDirection.SHORT && state.fisher > COINT_FISHER_HOSTILITY_THRESHOLD) ||
                               (direction === SignalDirection.LONG && state.fisher < -COINT_FISHER_HOSTILITY_THRESHOLD);
                               
        // S-102: Volatility Sanity Filter
        // Cointegration (Mean Reversion) breaks down during extreme volatility spikes
        const isExtremeVolatility = state.dvol > COINT_MAX_SAFE_DVOL; 

        // S-10X: Regime-Conditioned Z-Score Cointegration Engine
        const zThreshold = 2.0;
        let s10xPassed = true;
        let s10xReason = '';
        const degradedMode =
            typeof state.cointZScore !== 'number' ||
            typeof state.cointRollingMean !== 'number' ||
            typeof state.cointRollingStd !== 'number' ||
            typeof state.cointStrength !== 'number';
        const absZScore = degradedMode ? 0 : Math.abs(state.cointZScore as number);
        const cointStrength = state.cointStrength ?? null;
        const beta = state.cointBeta ?? 1.0;
        const spread = degradedMode ? null : null;
        const rollingMean = state.cointRollingMean ?? 0;
        const rollingStd = state.cointRollingStd ?? 0;

        if (!degradedMode) {
            if (absZScore < zThreshold) {
                s10xPassed = false;
                s10xReason = `Z-Score magnitude ${absZScore.toFixed(2)} below threshold ${zThreshold}`;
            } else if (typeof cointStrength === 'number' && cointStrength < 0.6) {
                s10xPassed = false;
                s10xReason = `Cointegration strength proxy ${cointStrength.toFixed(2)} is too weak`;
            }

            logStructured('QUANT', 'INFO', 'cointegration_zscore_evaluated', `[${state.asset}] S-10X Evaluated. zScore=${state.cointZScore?.toFixed(2)}`, {
                asset: state.asset,
                targetAsset,
                spread,
                beta,
                rollingMean,
                rollingStd,
                zScore: state.cointZScore,
                absZScore,
                zThreshold,
                cointegrationStrength: cointStrength,
                betaStability: state.cointBetaStability ?? null,
                halfLifeEstimate: state.cointHalfLife ?? null,
                regime: state.regime,
                volatilityRegime: state.regime === 'HIGH_VOLATILITY' ? 'HIGH' : 'NORMAL',
                passed: s10xPassed,
                degradedMode,
                reason: s10xReason,
                eventVersion: "S-10X_v1",
                cointegrationStrengthType: "residual_stationarity_proxy",
                service: "trading-engine",
                component: "cointegration-strategy",
                timestampUtc: new Date().toISOString(),
                correlationId: state.correlationId ?? null
            });

            if (s10xPassed) {
                logStructured('QUANT', 'INFO', 'cointegration_zscore_accepted', `[${state.asset}] S-10X Accepted.`, {
                    asset: state.asset,
                    targetAsset,
                    zScore: state.cointZScore,
                    passed: true,
                    eventVersion: "S-10X_v1",
                    service: "trading-engine",
                    component: "cointegration-strategy",
                    timestampUtc: new Date().toISOString(),
                    correlationId: state.correlationId ?? null
                });
            } else {
                logStructured('QUANT', 'WARN', 'cointegration_zscore_rejected', `[${state.asset}] S-10X Rejected: ${s10xReason}`, {
                    asset: state.asset,
                    targetAsset,
                    zScore: state.cointZScore,
                    reason: s10xReason,
                    passed: false,
                    eventVersion: "S-10X_v1",
                    service: "trading-engine",
                    component: "cointegration-strategy",
                    timestampUtc: new Date().toISOString(),
                    correlationId: state.correlationId ?? null
                });
            }
        } else {
            const missingInputs = [];
            if (typeof state.cointZScore !== 'number') missingInputs.push('cointZScore');
            if (typeof state.cointRollingMean !== 'number') missingInputs.push('cointRollingMean');
            if (typeof state.cointRollingStd !== 'number') missingInputs.push('cointRollingStd');
            if (typeof state.cointStrength !== 'number') missingInputs.push('cointStrength');

            logStructured('QUANT', 'WARN', 'cointegration_zscore_evaluated', `[${state.asset}] S-10X Degraded Mode (Missing Z-Score inputs)`, {
                 asset: state.asset,
                 targetAsset,
                 passed: true,
                 degradedMode: true,
                 reason: "Upstream Z-Score inputs missing",
                 missingInputs,
                 eventVersion: "S-10X_v1",
                 service: "trading-engine",
                 component: "cointegration-strategy",
                 timestampUtc: new Date().toISOString(),
                 correlationId: state.correlationId ?? null
            });
        }

        let passed = false;
        let finalScore = score;
        let reason = '';

        if (isHostileTrend) {
            passed = false;
            finalScore = 0;
            reason = 'Trend Hostility Filter';
            
            logStructured('QUANT', 'WARN', 'cointegration_signal_rejected_filter', `[${state.asset}] Rejected by Trend Hostility Filter. direction=${direction}, fisher=${state.fisher.toFixed(2)}`, {
                asset: state.asset,
                targetAsset,
                direction,
                filter: 'TREND_HOSTILITY',
                fisher: state.fisher,
                fundingDiff,
                rSquared: state.rSquared,
                passed,
                reason,
                correlationId: state.correlationId ?? null
            });
        } else if (isExtremeVolatility) {
            passed = false;
            finalScore = 0;
            reason = 'Volatility Sanity Filter';
            
            logStructured('QUANT', 'WARN', 'cointegration_signal_rejected_filter', `[${state.asset}] Rejected by Volatility Sanity Filter. dvol=${state.dvol}`, {
                asset: state.asset,
                targetAsset,
                filter: 'EXTREME_VOLATILITY',
                dvol: state.dvol,
                fundingDiff,
                rSquared: state.rSquared,
                passed,
                reason,
                correlationId: state.correlationId ?? null
            });
        } else if (!s10xPassed) {
            passed = false;
            finalScore = 0;
            reason = s10xReason;
            
            logStructured('QUANT', 'WARN', 'cointegration_signal_rejected_filter', `[${state.asset}] Rejected by S-10X Z-Score Engine. reason=${s10xReason}`, {
                asset: state.asset,
                targetAsset,
                direction,
                filter: 'S10X_ZSCORE_GATE',
                zScore: state.cointZScore,
                cointStrength,
                passed,
                reason,
                correlationId: state.correlationId ?? null
            });
        } else {
            passed = score >= effectiveThreshold && isRegimeValid;
            reason = !passed ? (score < effectiveThreshold ? `Score too low (${score})` : "Wrong regime") : "Regime match";
            finalScore = score;
        }

        logStructured('QUANT', 'INFO', 'cointegration_signal_evaluated', `[${state.asset}] Cointegration evaluated. score=${score}, direction=${direction}`, {
            asset: state.asset,
            targetAsset,
            score,
            direction,
            regime: state.regime,
            vwapDevAbs,
            effectiveThreshold,
            fundingDiff,
            rSquared: state.rSquared,
            passed,
            reason,
            correlationId: state.correlationId ?? null
        });

        if (passed) {
            logStructured('QUANT', 'INFO', 'cointegration_signal_accepted', `[${state.asset}] Cointegration signal accepted. score=${score}`, {
                 asset: state.asset,
                 targetAsset,
                 score,
                 direction,
                 regime: state.regime,
                 fundingDiff,
                 rSquared: state.rSquared,
                 passed,
                 reason,
                 correlationId: state.correlationId ?? null
            });
        }

        return { passed, score: finalScore, reason };
    }

    execute(state: MarketAnalysisState, config: AppConfig): TradingSignal | null {
        const validation = this.validate(state, config);
        if (!validation.passed) return null;
        
        const score = validation.score;
        const isBTC = state.asset.includes('BTC');
        const targetAsset = isBTC ? 'ETH' : 'BTC';
        const correlatedSummary = state.allSummaries?.find(s => s.instrument_name && s.instrument_name.includes(targetAsset));
        const fundingDiff = state.fundingRate - (correlatedSummary?.funding_8h || 0);

        // If price is above VWAP significantly, we expect it to revert down to match the correlated asset
        const direction = state.vwapDeviation > 0 ? SignalDirection.SHORT : SignalDirection.LONG;
      
        const risk = calculateInstitutionalRisk(state, direction, 'MEAN_REV');

        // Dynamic Position Sizing
        const baseConfigSize = isBTC ? (config.fixedLotSizeBTC || 0.1) : (config.fixedLotSizeETH || 0.2);
        const institutionalRiskCap = isBTC ? 5.0 : 10.0; // Max allowed by default

        let microstructureRisk = 0.5;
        if (state.orderBookImbalance !== null && state.orderBookImbalance !== undefined) {
            const obi = state.orderBookImbalance;
            const adverseObi = direction === SignalDirection.LONG ? -obi : obi;
            microstructureRisk = (Math.max(-1, Math.min(1, adverseObi)) + 1) / 2;
        }
        if (state.toxicityMetric !== null && state.toxicityMetric !== undefined && state.normalizedOfi !== null) {
            const nofi = state.normalizedOfi || 0;
            const adverseNofi = direction === SignalDirection.LONG ? -nofi : nofi;
            const flowRisk = (Math.max(-1, Math.min(1, adverseNofi)) + 1) / 2;
            microstructureRisk = (microstructureRisk + flowRisk + (state.toxicityMetric * 0.5)) / 2.5;
        }

        const sizingInput: PositionSizingInput = {
            asset: state.asset,
            direction,
            signalStrength: score,
            volatilityProxy: state.volRatio || 1.0,
            microstructureRisk,
            regime: state.regime,
            baseConfigSize,
            hunterMode: !!config.hunterMode,
            institutionalRiskCap
        };
        
        const sizing = positionSizingEngine.calculateSize(sizingInput);

        
                return {
            id: `COINT-${state.asset}-${Date.now()}`,
            timestamp: Date.now(),
            asset: state.asset,
            direction,
            strength: score > 85 ? SignalStrength.STRONG : SignalStrength.STANDARD,
            entry: state.price,
            stopLoss: risk.stopLoss,
            takeProfit: risk.takeProfit,
            tp1: risk.tp1,
            tp2: risk.tp2,
            qualityScore: score,
            recommendedSize: sizing.recommendedSize,
            reasoning: `Cointegration divergence vs ${targetAsset}. VWAP Dev: ${(state.vwapDeviation * 100).toFixed(2)}%, Funding Diff: ${(fundingDiff * 100).toFixed(4)}%`,
            strategy: 'COINTEGRATION',
            details: {
                volumeMultiplier: 1.0,
                fundingRate: state.fundingRate,
                correlationScore: state.rSquared,
                fisher: state.fisher,
                volatilityPremium: state.dvol,
                statisticalEdge: score,
                quantRegime: state.regime,
                vwap: state.price / (1 + state.vwapDeviation),
                vwapDeviation: state.vwapDeviation,
                hurstExponent: state.hurst
            }
        };
    }
}
