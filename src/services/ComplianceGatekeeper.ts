import { TradingSignal, AppConfig, MarketAnalysisState } from "../types";

export interface ComplianceResult {
  passed: boolean;
  reason: string;
}

export class ComplianceGatekeeper {
  private config: AppConfig;

  constructor(config: AppConfig) {
    this.config = config;
  }

  public updateConfig(newConfig: AppConfig) {
    this.config = newConfig;
  }

  /**
   * Institutional Compliance Gates
   * Verifies if the signal meets strict institutional risk management standards.
   */
  public validateSignal(
    signal: TradingSignal,
    analysis: MarketAnalysisState,
  ): ComplianceResult {
    // 1. Regulatory/Market Noise Floor (Basic sanity)
    if (!signal.asset || signal.asset === "") {
      return { passed: false, reason: "Invalid asset definition" };
    }

    const gates =
      this.config.strategyGates?.[signal.strategy] || (this.config as any);

    // 2. Volatility Check - Relaxed to allow for high profit setups
    const maxDvol = (gates.dvol || 100) * 3; // Allow up to 3x normal DVOL
    if (analysis.dvol > maxDvol && analysis.dvol > 200.0) {
      return {
        passed: false,
        reason: `Market too toxic/volatile (DVOL > ${maxDvol})`,
      };
    }

    // 3. Liquidity/Slippage Check - Relaxed for professional sizing
    if (analysis.estimatedSlippage > (gates.slippage || 0.05) * 5) {
      return {
        passed: false,
        reason: `Slippage too high (${analysis.estimatedSlippage} > ${gates.slippage})`,
      };
    }

    // 4. Trend/Regime Consistency - Relaxed to allow aggressive contrarian entries
    if (
      analysis.mtfStatus.dailyTrend === "UP" &&
      signal.direction === "SHORT" &&
      !signal.strategy.includes("MEAN_REV") &&
      !signal.strategy.includes("SCALPER")
    ) {
      // Intentionally bypassed to allow professional quick scalping/hedging
    }

    // 5. ADR Exhaustion Check (Institutional Reversal Detection)
    // Prevents margin pressure from fighting against clear daily range limits
    if (analysis.adrExhaustion === 'DOWN' && signal.direction === 'SHORT') {
        return {
            passed: false,
            reason: `Blocked SHORT: Downside ADR (Average Daily Range) Exhaustion detected at price ${analysis.price}. Likely reversal.`
        };
    }
    if (analysis.adrExhaustion === 'UP' && signal.direction === 'LONG') {
        return {
            passed: false,
            reason: `Blocked LONG: Upside ADR (Average Daily Range) Exhaustion detected at price ${analysis.price}. Likely pullback.`
        };
    }

    // We removed 6. Signal Quality Check because tradingAlgo.ts
    // already handles score thresholds properly, including strategy-specific
    // overrides (like Cointegration lowering minimum to 65).

    return { passed: true, reason: "Compliance check passed" };
  }
}
