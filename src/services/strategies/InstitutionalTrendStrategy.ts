import { BaseStrategy } from "./BaseStrategy";
import { calculateInstitutionalRisk } from "./ScoringUtils";
import { MarketAnalysisState, AppConfig, TradingSignal, SignalDirection, SignalStrength } from "../../types";
import { calculateCVD, calculateLiquidityImbalance } from "../tradingAlgo";

export class InstitutionalTrendStrategy implements BaseStrategy {
    validate(state: MarketAnalysisState, config: AppConfig): { passed: boolean; score: number; reason?: string } {
        // 1. Order Flow Imbalance Check
        const ofi = state.orderFlowSignal;
        const ofiScore = ofi ? 30 : 0;

        // 2. CVD Trend Check
        const cvd = calculateCVD(0, 1000, 500); // Simplified for example
        const cvdScore = cvd.trend === 'RISING' ? 30 : 0;

        // 3. Liquidity Check
        const liquidity = calculateLiquidityImbalance(1000, 500);
        const liquidityScore = liquidity.signal === 'BUY' ? 20 : 0;

        const totalScore = ofiScore + cvdScore + liquidityScore;

        const effectiveThreshold = config.hunterMode 
          ? Math.max(0, (config.minSignalScore || 80) - 20) 
          : (config.minSignalScore || 80);

        return {
            passed: totalScore >= effectiveThreshold,
            score: totalScore,
            reason: totalScore >= effectiveThreshold ? "Strong Institutional Trend" : "Weak Trend"
        };
    }

    execute(state: MarketAnalysisState, config: AppConfig): TradingSignal | null {
        const direction = state.orderFlowSignal === 'BUY_SIGNAL' ? SignalDirection.LONG : SignalDirection.SHORT;
        
        // Position Sizing Algorithm
        const confidence = state.qualityScore / 100;
        const positionSize = (10000 * confidence) / 100; // Simplified balance

        
      const risk = calculateInstitutionalRisk(state, direction, 'TREND');
      
      return {
            id: Math.random().toString(),
            timestamp: Date.now(),
            asset: state.asset,
            direction,
            strength: SignalStrength.STRONG,
            entry: state.price,
            stopLoss: risk.stopLoss,
            takeProfit: risk.takeProfit,
            tp1: risk.tp1,
            tp2: risk.tp2,
            qualityScore: state.qualityScore,
            reasoning: "Institutional Trend Detected via OFI/CVD",
            strategy: 'BTC_TREND',
            details: {
                volumeMultiplier: 1,
                fundingRate: 0,
                correlationScore: 0,
                fisher: state.fisher,
                volatilityPremium: 0,
                statisticalEdge: 0,
                quantRegime: state.regime,
                vwap: 0,
                vwapDeviation: state.vwapDeviation,
                hurstExponent: state.hurst,
                kellyBet: positionSize
            }
        };

    }
}
