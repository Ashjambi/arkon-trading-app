import { positionSizingEngine, PositionSizingInput } from '../../PositionSizingEngine';
import {
  TradingSignal,
  SignalDirection,
  SignalStrength,
  MarketAnalysisState,
  AppConfig,
} from "../../../types";
import { BaseStrategy } from "../BaseStrategy";
import { calculateInstitutionalRisk } from "../ScoringUtils";
import { logStructured } from "../../../utils/logger";

export class BTCScalperStrategy implements BaseStrategy {
  validate(state: MarketAnalysisState, config: AppConfig) {
    let score = 0;
    let direction: SignalDirection | null = null;
    
    // High-Probability Quant Scalper Logic (Targeting 0.50$ wins)
    const vwapZScore = state.vwapZScore || 0;
    const isDeepOversold = state.fisher < -0.15 || vwapZScore < -0.3; 
    const isDeepOverbought = state.fisher > 0.15 || vwapZScore > 0.3; 
    
    // Volume & Microstructure confirmation
    const isVolumeSpike = state.volRatio > 0.8; // Relaxed from 1.0
    const orderFlowConfirmLong = state.liquidityGap > 0.02; // Relaxed from 0.05
    const orderFlowConfirmShort = state.liquidityGap < -0.02; // Relaxed from -0.05

    let longScore = 0;
    let shortScore = 0;

    // Tie breaker so we don't end up with 0 score
    if (state.vwapZScore < 0) {
      longScore += 15;
    } else {
      shortScore += 15;
    }

    // 1. Mean Reversion from Extremes (Strongest Signal for Scalps)
    if (isDeepOversold) longScore += 45;
    if (isDeepOverbought) shortScore += 45;

    // Base Activity Score to ensure trades happen frequently when Hunter Mode is active
    longScore += 45;
    shortScore += 45;

    // 2. Liquidity / Stop Hunts (Wick sweeps)
    if (state.bullishSweep) longScore += 30;
    if (state.bearishSweep) shortScore += 30;

    // 3. Institutional Validation (Volume & Order Flow)
    if (isVolumeSpike) {
        if (state.trendDirection === "UP" || orderFlowConfirmLong) longScore += 20;
        if (state.trendDirection === "DOWN" || orderFlowConfirmShort) shortScore += 20;
    }

    // 4. Momentum alignment
    if (state.trendDirection === "UP" && state.fisher > 0) longScore += 10;
    if (state.trendDirection === "DOWN" && state.fisher < 0) shortScore += 10;

    // Determine direction
    if (longScore > shortScore) {
        score = Math.min(100, longScore);
        direction = SignalDirection.LONG;
    } else if (shortScore > longScore) {
        score = Math.min(100, shortScore);
        direction = SignalDirection.SHORT;
    }

    // INTENT DOCS:
    // خفض الحد الأدنى للقبول (عبر خصم 20 نقطة) في وضع الـ hunterMode هو تصميم مقصود 
    // لزيادة التقاط إشارات الإسكالبينج وعدم تضييق الشبكة. تعديل هذا المنطق سيكسر استراتيجية 
    // Grid Hunter المتفق عليها. (Not a bug cleanup target).
    const effectiveThreshold = config.hunterMode ? Math.max(0, (config.minSignalScore || 80) - 20) : (config.minSignalScore || 80);
    let passed = score >= effectiveThreshold;
    let reason = passed ? 'Score threshold met' : 'Score too low';

    // S-103: Scalper Signal-Quality Tightening
    if (passed && direction) {
        const isContradictory = 
            (direction === SignalDirection.LONG && state.trendDirection === "DOWN" && orderFlowConfirmShort) ||
            (direction === SignalDirection.SHORT && state.trendDirection === "UP" && orderFlowConfirmLong);
            
        const isNoisyBorderline = state.regime === "CHOPPY/NOISE" && score < (effectiveThreshold + 10);

        if (isContradictory) {
            passed = false;
            reason = 'Contradictory indicators (Trend vs Microstructure)';
            logStructured('QUANT', 'WARN', 'scalper_signal_rejected_low_conviction', `[${state.asset}] Rejected by Contradiction. direction=${direction}, trend=${state.trendDirection}, gap=${state.liquidityGap}`, {
                asset: state.asset,
                strategy: 'BTC_SCALPER',
                score,
                threshold: effectiveThreshold,
                direction,
                trendDirection: state.trendDirection,
                liquidityGap: state.liquidityGap,
                passed,
                reason
            });
        } else if (isNoisyBorderline) {
            passed = false;
            reason = 'Borderline score in Choppy/Noise regime';
            logStructured('QUANT', 'WARN', 'scalper_signal_rejected_low_conviction', `[${state.asset}] Rejected by Noise. direction=${direction}, score=${score}, regime=${state.regime}`, {
                asset: state.asset,
                strategy: 'BTC_SCALPER',
                score,
                threshold: effectiveThreshold,
                direction,
                regime: state.regime,
                passed,
                reason
            });
        }
    }

    // S-10Y Final Phase: Microstructure Validation Gate
    const SCALPER_OBI_CONTRADICTION_THRESHOLD = 0.3;
    const SCALPER_OFI_CONTRADICTION_THRESHOLD = 0.2; // normalizedOfi threshold
    const SCALPER_TOXICITY_THRESHOLD = 0.7; // 70% flow is one-sided
    
    let s10yPassed = passed;
    let s10yDegradedMode = false;
    let s10yReason = "";

    if (passed && direction) {
        if (state.orderBookImbalance === null || state.orderBookImbalance === undefined) {
            s10yDegradedMode = true;
        } else {
            const obi = state.orderBookImbalance;
            const isChoppy = state.regime === "CHOPPY/NOISE";
            const isUnstableVol = state.volRatio > 1.2;
            
            const hasFlow = state.tradeFlowAvailable === true;
            const normOfi = state.normalizedOfi || 0;
            const toxicity = state.toxicityMetric || 0;

            if (direction === SignalDirection.LONG) {
                const hostileBook = obi <= -SCALPER_OBI_CONTRADICTION_THRESHOLD;
                const hostileFlow = hasFlow && normOfi <= -SCALPER_OFI_CONTRADICTION_THRESHOLD;
                const toxic = hasFlow && normOfi < 0 && toxicity >= SCALPER_TOXICITY_THRESHOLD;
                
                const hostileLiquidity = state.liquidityGap < -0.05;
                const hostileTopLevel = state.topLevelImbalance !== null && state.topLevelImbalance !== undefined && state.topLevelImbalance < -0.2;
                const hostileMicroPrice = state.microPriceDeviation !== null && state.microPriceDeviation !== undefined && state.microPriceDeviation < -0.0001;
                
                const hostileContext = state.bearishSweep || hostileLiquidity || isUnstableVol || isChoppy;
                const secondaryConfirmation = hostileTopLevel || hostileMicroPrice || hostileContext || hostileFlow || toxic;
                
                // Veto requires either both Book and Flow to contradict strongly, or Book contradicts + secondary context
                if (hostileBook && secondaryConfirmation) {
                    s10yPassed = false;
                    s10yReason = "S-10Y: Strong ask imbalance + confirmation (Flow/Context)";
                } else if (hasFlow && hostileFlow && (hostileContext || toxic)) {
                    s10yPassed = false;
                    s10yReason = "S-10Y: Strong ask flow + toxic/context";
                }
            } else if (direction === SignalDirection.SHORT) {
                const hostileBook = obi >= SCALPER_OBI_CONTRADICTION_THRESHOLD;
                const hostileFlow = hasFlow && normOfi >= SCALPER_OFI_CONTRADICTION_THRESHOLD;
                const toxic = hasFlow && normOfi > 0 && toxicity >= SCALPER_TOXICITY_THRESHOLD;

                const hostileLiquidity = state.liquidityGap > 0.05;
                const hostileTopLevel = state.topLevelImbalance !== null && state.topLevelImbalance !== undefined && state.topLevelImbalance > 0.2;
                const hostileMicroPrice = state.microPriceDeviation !== null && state.microPriceDeviation !== undefined && state.microPriceDeviation > 0.0001;
                
                const hostileContext = state.bullishSweep || hostileLiquidity || isUnstableVol || isChoppy;
                const secondaryConfirmation = hostileTopLevel || hostileMicroPrice || hostileContext || hostileFlow || toxic;
                
                if (hostileBook && secondaryConfirmation) {
                    s10yPassed = false;
                    s10yReason = "S-10Y: Strong bid imbalance + confirmation (Flow/Context)";
                } else if (hasFlow && hostileFlow && (hostileContext || toxic)) {
                    s10yPassed = false;
                    s10yReason = "S-10Y: Strong bid flow + toxic/context";
                }
            }
        }

        logStructured('QUANT', 'INFO', 'scalper_microstructure_evaluated', `[${state.asset}] S-10Y Evaluated. obi=${state.orderBookImbalance}`, {
            asset: state.asset,
            strategy: 'BTC_SCALPER',
            direction,
            score,
            threshold: effectiveThreshold,
            ofi: state.ofi ?? null,
            normalizedOfi: state.normalizedOfi ?? null,
            recentSignedVolume: state.recentSignedVolume ?? null,
            recentTradeCount: state.recentTradeCount ?? null,
            tradeFlowAvailable: state.tradeFlowAvailable ?? false,
            orderBookImbalance: state.orderBookImbalance ?? null,
            microPrice: state.microPrice ?? null,
            microPriceDeviation: state.microPriceDeviation ?? null,
            topLevelImbalance: state.topLevelImbalance ?? null,
            depthPressure: state.depthPressure ?? null,
            toxicityMetric: state.toxicityMetric ?? null,
            liquidityGap: state.liquidityGap,
            bullishSweep: state.bullishSweep,
            bearishSweep: state.bearishSweep,
            volRatio: state.volRatio,
            regime: state.regime,
            hunterMode: config.hunterMode,
            passed: s10yPassed,
            degradedMode: s10yDegradedMode,
            reason: s10yPassed ? (s10yDegradedMode ? 'Degraded (No OBI)' : 'Microstructure confirmed') : s10yReason,
            eventVersion: 'S-10Y_v3',
            service: 'trading-engine',
            component: 'microstructure-gate',
            timestampUtc: new Date().toISOString(),
            correlationId: state.correlationId ?? null
        });

        if (!s10yPassed) {
            logStructured('QUANT', 'WARN', 'scalper_microstructure_rejected', `[${state.asset}] S-10Y Rejected: ${s10yReason}`, {
                asset: state.asset,
                strategy: 'BTC_SCALPER',
                direction,
                score,
                threshold: effectiveThreshold,
                ofi: state.ofi ?? null,
                normalizedOfi: state.normalizedOfi ?? null,
                recentSignedVolume: state.recentSignedVolume ?? null,
                recentTradeCount: state.recentTradeCount ?? null,
                tradeFlowAvailable: state.tradeFlowAvailable ?? false,
                orderBookImbalance: state.orderBookImbalance ?? null,
                microPrice: state.microPrice ?? null,
                microPriceDeviation: state.microPriceDeviation ?? null,
                topLevelImbalance: state.topLevelImbalance ?? null,
                depthPressure: state.depthPressure ?? null,
                toxicityMetric: state.toxicityMetric ?? null,
                liquidityGap: state.liquidityGap,
                bullishSweep: state.bullishSweep,
                bearishSweep: state.bearishSweep,
                volRatio: state.volRatio,
                regime: state.regime,
                hunterMode: config.hunterMode,
                passed: false,
                degradedMode: s10yDegradedMode,
                reason: s10yReason,
                eventVersion: 'S-10Y_v3',
                service: 'trading-engine',
                component: 'microstructure-gate',
                timestampUtc: new Date().toISOString(),
                correlationId: state.correlationId ?? null
            });
        } else {
            logStructured('QUANT', 'INFO', 'scalper_microstructure_accepted', `[${state.asset}] S-10Y Accepted`, {
                asset: state.asset,
                strategy: 'BTC_SCALPER',
                direction,
                score,
                threshold: effectiveThreshold,
                ofi: state.ofi ?? null,
                normalizedOfi: state.normalizedOfi ?? null,
                recentSignedVolume: state.recentSignedVolume ?? null,
                recentTradeCount: state.recentTradeCount ?? null,
                tradeFlowAvailable: state.tradeFlowAvailable ?? false,
                orderBookImbalance: state.orderBookImbalance ?? null,
                microPrice: state.microPrice ?? null,
                microPriceDeviation: state.microPriceDeviation ?? null,
                topLevelImbalance: state.topLevelImbalance ?? null,
                depthPressure: state.depthPressure ?? null,
                toxicityMetric: state.toxicityMetric ?? null,
                liquidityGap: state.liquidityGap,
                bullishSweep: state.bullishSweep,
                bearishSweep: state.bearishSweep,
                volRatio: state.volRatio,
                regime: state.regime,
                hunterMode: config.hunterMode,
                passed: true,
                degradedMode: s10yDegradedMode,
                reason: s10yDegradedMode ? 'Degraded (No OBI)' : 'Microstructure confirmed',
                eventVersion: 'S-10Y_v3',
                service: 'trading-engine',
                component: 'microstructure-gate',
                timestampUtc: new Date().toISOString(),
                correlationId: state.correlationId ?? null
            });
        }

        passed = s10yPassed;
        if (!passed) {
            reason = s10yReason;
        }
    }

    logStructured('QUANT', 'INFO', 'scalper_signal_evaluated', `[${state.asset}] Scalper evaluated. score=${score}, direction=${direction}`, {
        asset: state.asset,
        strategy: 'BTC_SCALPER',
        score,
        threshold: effectiveThreshold,
        direction,
        regime: state.regime,
        trendDirection: state.trendDirection,
        liquidityGap: state.liquidityGap,
        volRatio: state.volRatio,
        bullishSweep: state.bullishSweep,
        bearishSweep: state.bearishSweep,
        fisher: state.fisher,
        vwapDeviation: state.vwapDeviation,
        passed,
        reason
    });

    if (passed && direction) {
        logStructured('QUANT', 'INFO', 'scalper_signal_accepted', `[${state.asset}] Scalper accepted. score=${score}, direction=${direction}`, {
            asset: state.asset,
            strategy: 'BTC_SCALPER',
            score,
            threshold: effectiveThreshold,
            direction,
            regime: state.regime,
            passed,
            reason
        });
    }

    return { passed, score, direction, reason };
  }

  execute(state: MarketAnalysisState, config: AppConfig): TradingSignal | null {
    const { passed, score, direction } = this.validate(state, config);
    if (passed && direction) {
      const risk = calculateInstitutionalRisk(state, direction, 'SCALPER');

      // Dynamic Position Sizing
      const baseConfigSize = config.fixedLotSizeBTC || 0.1;
      const institutionalRiskCap = 5.0; // Max allowed for BTC by default

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
        id: `BTC_SCALPER-${Date.now()}`,
        timestamp: Date.now(),
        asset: state.asset,
        direction,
        strength: SignalStrength.STRONG,
        entry: state.price,
        stopLoss: risk.stopLoss,
        takeProfit: risk.takeProfit,
        tp1: risk.tp1,
        tp2: risk.tp2,
        qualityScore: score,
        recommendedSize: sizing.recommendedSize,
        reasoning:
          "Quant Institutional Scalper: Liquidity sweep detected with VWAP trend alignment.",
        strategy: "BTC_SCALPER",
        details: {
          volumeMultiplier: 1,
          fundingRate: state.fundingRate,
          correlationScore: state.liquidityGap,
          fisher: state.fisher,
          volatilityPremium: state.dvol,
          statisticalEdge: score,
          quantRegime: state.regime,
          vwap: state.vwapMain,
          vwapDeviation: state.vwapDeviation,
          hurstExponent: state.hurst,
        },
      };
    }
    return null;
  }
}
