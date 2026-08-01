/**
 * ARKON v50.0.0 — Custom Hook: إدارة الإعدادات
 * استخراج منطق config من App.tsx
 */
import { useState, useCallback, useEffect } from "react";
import type { AppConfig, StrategyType, StrategyPerformance, StrategyGates } from "../types";
import { CURRENT_VERSION, DEFAULT_WEBHOOK_URL } from "../utils/constants";
import { getEffectiveUrl } from "../services/webhookService";
import type { LogType } from "../types";

// ========== CONSTANTS ==========
const createDefaultPerf = (
  type: "SCALPING" | "SWING",
  isEnabled: boolean = true,
): StrategyPerformance => ({
  wins: 0,
  losses: 0,
  totalProfitPoints: 0,
  totalLossPoints: 0,
  successScore: 0,
  isEnabled,
  type,
  totalTrades: 0,
  winRate: 0,
  profitFactor: 0,
  sharpeRatio: 0,
  maxDrawdown: 0,
  lastTradeTime: 0,
  consecutiveLosses: 0,
});

const ALL_STRATEGIES: StrategyType[] = [
  "BTC_TREND", "BTC_MEAN_REV", "BTC_TREND_FOLLOWING", "BTC_OFI", "BTC_AVR", "BTC_SCALPER",
  "ETH_TREND", "ETH_MEAN_REV", "ETH_TREND_FOLLOWING", "ETH_CORR_ARB", "ETH_VOL_BREAK", "ETH_SCALPER",
  "GOLD_TREND", "GOLD_MEAN_REV", "GOLD_SCALPER",
  "SOL_TREND", "SOL_MEAN_REV", "SOL_SCALPER",
  "PAIRS_TRADING", "VOLATILITY_BREAKOUT", "COINTEGRATION", "MEAN_REVERSION_ALPHA",
  "BREAKOUT_CAPTURE", "ARBITRAGE_SCANNER", "GRID_TRADING", "NEWS_SHOCK", "WAIT",
];

const DEFAULT_STRATEGY_PERFORMANCE: Record<StrategyType, StrategyPerformance> =
  Object.fromEntries(
    ALL_STRATEGIES.map((s) => [
      s,
      createDefaultPerf(
        [
          "BTC_MEAN_REV", "BTC_OFI", "BTC_AVR", "BTC_SCALPER",
          "ETH_MEAN_REV", "ETH_SCALPER",
          "GOLD_SCALPER", "GOLD_MEAN_REV",
          "SOL_SCALPER", "SOL_MEAN_REV",
          "MEAN_REVERSION_ALPHA", "GRID_TRADING", "NEWS_SHOCK",
        ].includes(s)
          ? "SCALPING"
          : "SWING",
      ),
    ]),
  ) as Record<StrategyType, StrategyPerformance>;

const DEFAULT_STRATEGY_GATES: Record<StrategyType, StrategyGates> = {
  BTC_TREND: { hurst: 0.55, fisher: 1.2, rSquared: 0.3, dvol: 40, toxicity: 0.7, slippage: 0.001, vwapZScore: 1.5, ofi: 0.2, volRatio: 1.2 },
  BTC_MEAN_REV: { hurst: 0.4, fisher: 1.5, rSquared: 0.2, dvol: 30, toxicity: 0.5, slippage: 0.001, vwapZScore: 2.0, ofi: 0.1, volRatio: 1.1 },
  BTC_TREND_FOLLOWING: { hurst: 0.6, fisher: 0.8, rSquared: 0.4, dvol: 45, toxicity: 0.8, slippage: 0.001, vwapZScore: 1.2, ofi: 0.3, volRatio: 1.5 },
  BTC_OFI: { hurst: 0.5, fisher: 1.0, rSquared: 0.3, dvol: 40, toxicity: 0.6, slippage: 0.001, vwapZScore: 1.5, ofi: 0.4, volRatio: 1.2 },
  BTC_AVR: { hurst: 0.5, fisher: 1.0, rSquared: 0.3, dvol: 40, toxicity: 0.6, slippage: 0.001, vwapZScore: 1.5, ofi: 0.2, volRatio: 1.2 },
  BTC_SCALPER: { hurst: 0.4, fisher: 1.2, rSquared: 0.2, dvol: 30, toxicity: 0.5, slippage: 0.001, vwapZScore: 2.0, ofi: 0.1, volRatio: 1.1 },
  ETH_TREND: { hurst: 0.55, fisher: 1.5, rSquared: 0.4, dvol: 50, toxicity: 0.7, slippage: 0.001, vwapZScore: 2.0, ofi: 0.2, volRatio: 1.5 },
  ETH_MEAN_REV: { hurst: 0.4, fisher: 2.0, rSquared: 0.3, dvol: 40, toxicity: 0.5, slippage: 0.001, vwapZScore: 2.5, ofi: 0.1, volRatio: 1.2 },
  ETH_TREND_FOLLOWING: { hurst: 0.6, fisher: 1.0, rSquared: 0.5, dvol: 60, toxicity: 0.8, slippage: 0.001, vwapZScore: 1.5, ofi: 0.3, volRatio: 1.8 },
  ETH_CORR_ARB: { hurst: 0.5, fisher: 1.0, rSquared: 0.4, dvol: 50, toxicity: 0.6, slippage: 0.001, vwapZScore: 2.0, ofi: 0.2, volRatio: 1.5 },
  ETH_VOL_BREAK: { hurst: 0.6, fisher: 1.0, rSquared: 0.4, dvol: 70, toxicity: 0.9, slippage: 0.001, vwapZScore: 1.5, ofi: 0.4, volRatio: 2.0 },
  ETH_SCALPER: { hurst: 0.4, fisher: 1.5, rSquared: 0.3, dvol: 40, toxicity: 0.5, slippage: 0.001, vwapZScore: 2.5, ofi: 0.1, volRatio: 1.2 },
  GOLD_TREND: { hurst: 0.48, fisher: 0.8, rSquared: 0.25, dvol: 8, toxicity: 0.6, slippage: 0.0002, vwapZScore: 0.8, ofi: 0.08, volRatio: 0.6 },
  GOLD_MEAN_REV: { hurst: 0.5, fisher: 0.5, rSquared: 0.15, dvol: 8, toxicity: 0.6, slippage: 0.0002, vwapZScore: 0.5, ofi: 0.05, volRatio: 0.6 },
  GOLD_SCALPER: { hurst: 0.45, fisher: 0.5, rSquared: 0.2, dvol: 8, toxicity: 0.6, slippage: 0.0002, vwapZScore: 0.6, ofi: 0.05, volRatio: 0.5 },
  SOL_TREND: { hurst: 0.52, fisher: 1.0, rSquared: 0.3, dvol: 40, toxicity: 0.8, slippage: 0.001, vwapZScore: 1.5, ofi: 0.15, volRatio: 1.0 },
  SOL_MEAN_REV: { hurst: 0.48, fisher: 1.5, rSquared: 0.2, dvol: 40, toxicity: 0.7, slippage: 0.001, vwapZScore: 1.5, ofi: 0.1, volRatio: 0.8 },
  SOL_SCALPER: { hurst: 0.45, fisher: 1.2, rSquared: 0.2, dvol: 35, toxicity: 0.7, slippage: 0.001, vwapZScore: 1.2, ofi: 0.1, volRatio: 1.0 },
  PAIRS_TRADING: { hurst: 0.5, fisher: 1.5, rSquared: 0.5, dvol: 50, toxicity: 0.6, slippage: 0.001, vwapZScore: 2.0, ofi: 0.2, volRatio: 1.5 },
  VOLATILITY_BREAKOUT: { hurst: 0.6, fisher: 1.0, rSquared: 0.4, dvol: 70, toxicity: 0.9, slippage: 0.001, vwapZScore: 1.5, ofi: 0.4, volRatio: 2.0 },
  COINTEGRATION: { hurst: 0.5, fisher: 1.5, rSquared: 0.5, dvol: 50, toxicity: 0.6, slippage: 0.001, vwapZScore: 2.0, ofi: 0.2, volRatio: 1.5 },
  MEAN_REVERSION_ALPHA: { hurst: 0.4, fisher: 1.4, rSquared: 0.25, dvol: 25, toxicity: 0.6, slippage: 0.001, vwapZScore: 1.8, ofi: 0.1, volRatio: 1.0 },
  BREAKOUT_CAPTURE: { hurst: 0.58, fisher: 0.9, rSquared: 0.35, dvol: 45, toxicity: 0.75, slippage: 0.0012, vwapZScore: 1.2, ofi: 0.25, volRatio: 1.4 },
  ARBITRAGE_SCANNER: { hurst: 0.5, fisher: 1.0, rSquared: 0.45, dvol: 30, toxicity: 0.65, slippage: 0.0009, vwapZScore: 1.6, ofi: 0.15, volRatio: 1.0 },
  GRID_TRADING: { hurst: 0.45, fisher: 1.1, rSquared: 0.2, dvol: 20, toxicity: 0.6, slippage: 0.001, vwapZScore: 1.4, ofi: 0.1, volRatio: 0.9 },
  NEWS_SHOCK: { hurst: 0.7, fisher: 0.5, rSquared: 0.2, dvol: 80, toxicity: 1.0, slippage: 0.005, vwapZScore: 1.0, ofi: 0.5, volRatio: 2.5 },
  WAIT: { hurst: 0.5, fisher: 1.0, rSquared: 0.5, dvol: 50, toxicity: 0.5, slippage: 0.001, vwapZScore: 2.0, ofi: 0.2, volRatio: 1.5 },
};

const DEFAULT_CONFIG: AppConfig = {
  telegramBotToken: "",
  telegramChatId: "",
  enableTelegramAlerts: true,
  webhookUrl: DEFAULT_WEBHOOK_URL,
  bridgeLatencyThreshold: 500,
  autoExecution: true,
  adaptiveRiskEnabled: true,
  adaptiveRiskMaxExposurePct: 0.15,
  adaptiveRiskAtrMultiplierTrending: 2.0,
  adaptiveRiskAtrMultiplierRanging: 1.5,
  adaptiveRiskAtrMultiplierVolatile: 3.0,
  hunterMode: false,
  hunterModeEnabled: true,
  hunterMinSignalScore: 88,
  hunterAllowedRegimes: ["MOMENTUM_TREND", "HIGH_VOLATILITY"],
  hunterMaxSpreadBps: 18,
  hunterMinLiquidityScore: 60,
  hunterMaxVolatilityScore: 85,
  hunterSizeMultiplier: 1.25,
  hunterTargetMultiplier: 1.2,
  hunterAllowAddOnEntry: true,
  hunterAllowReentry: true,
  hunterMaxConcurrentHunterTrades: 3,
  hunterCooldownSeconds: 20,
  hunterMinExecutionConfidence: 0.7,
  hunterDisableDuringDrawdown: true,
  hunterDrawdownThreshold: 3.0,
  hunterLogDecisions: true,
  minSignalScore: 10,
  cooldownHours: 0.1,
  cooldownSameAssetMins: 1,
  riskRewardRatio: 2.0,
  maxOpenTrades: 100,
  maxTradesPerWave: 50,
  dynamicVolSpacing: 0.01,
  maxAllocationPerTradePercent: 2.0,
  fixedLotSizeBTC: 0.1,
  fixedLotSizeETH: 0.2,
  fixedLotSizeGOLD: 0.1,
  fixedLotSizeSOL: 1.0,
  equityProtectionPercent: 10.0,
  dailyLossLimitUSD: 250,
  maxDrawdownDailyPercent: 3.5,
  enableGoldTrading: true,
  goldMaxRiskPerTrade: 1.0,
  goldMaxConcurrentPositions: 2,
  goldSpreadFilter: 30,
  goldSessionFilter: false,
  goldSessionStart: 7,
  goldSessionEnd: 20,
  goldPriceMaxAgeMs: 15000,
  goldMaxLot: 1.0,
  forceClosePnL: 0.5,
  autoHedgeEnabled: true,
  hedgeRatio: 0.5,
  flipEnabled: false,
  flipSensitivityScore: 90,
  disableInitialSL: true,
  useVirtualSL: false,
  commissionRate: 0.0005,
  orderFlowConfig: { enabled: false, ofiThreshold: 0.3, imbalanceRatio: 3.0, minVolume: 100, vwapEnabled: true },
  hurst: 0.55, fisher: 1.5, rSquared: 0.4, dvol: 50, toxicity: 0.7, slippage: 0.001, vwapZScore: 2.0, ofi: 0.2, volRatio: 1.5,
  enableTrendFollowing: true,
  trendFollowingThreshold: 0.8,
  avrVolatilityThreshold: 2.5,
  avrLookbackPeriod: 20,
  ofiImbalanceThreshold: 0.8,
  ofiSensitivity: 5,
  corrThreshold: 0.9,
  corrLookback: 50,
  strategyPerformance: DEFAULT_STRATEGY_PERFORMANCE,
  strategyGates: DEFAULT_STRATEGY_GATES,
  autoDisableThreshold: 0,
  dcaZones: [],
};

// ========== HOOK ==========
export function useSettings(addLog?: (msg: string, type?: LogType, details?: any) => void) {
  const [config, setConfig] = useState<AppConfig>(() => {
    try {
      const saved = localStorage.getItem(`arkon_config_v${CURRENT_VERSION}`);
      let finalConfig: AppConfig;
      if (saved) {
        const parsed = JSON.parse(saved);
        const mergedPerf = { ...DEFAULT_STRATEGY_PERFORMANCE };
        if (parsed.strategyPerformance) {
          Object.keys(parsed.strategyPerformance).forEach((key) => {
            const stratKey = key as StrategyType;
            if (mergedPerf[stratKey]) {
              mergedPerf[stratKey] = {
                ...mergedPerf[stratKey],
                ...parsed.strategyPerformance[stratKey],
              };
            }
          });
        }
        finalConfig = {
          ...DEFAULT_CONFIG,
          ...parsed,
          strategyPerformance: mergedPerf,
        };
        // Safe defaults guardrails
        if (finalConfig.maxOpenTrades > 200) finalConfig.maxOpenTrades = 200;
        if (finalConfig.maxTradesPerWave > 100) finalConfig.maxTradesPerWave = 100;
        if (finalConfig.dynamicVolSpacing < 0.01) finalConfig.dynamicVolSpacing = 0.01;
        if (finalConfig.fixedLotSizeETH > 10.0) finalConfig.fixedLotSizeETH = 10.0;
        if (finalConfig.fixedLotSizeBTC > 5.0) finalConfig.fixedLotSizeBTC = 5.0;
        if ((finalConfig.hunterSizeMultiplier ?? 1.25) > 2) finalConfig.hunterSizeMultiplier = 2;
        if ((finalConfig.hunterTargetMultiplier ?? 1.2) > 2) finalConfig.hunterTargetMultiplier = 2;
        if ((finalConfig.hunterMaxConcurrentHunterTrades ?? 3) > 10) finalConfig.hunterMaxConcurrentHunterTrades = 10;
        if ((finalConfig.hunterMinExecutionConfidence ?? 0.7) > 1) finalConfig.hunterMinExecutionConfidence = 1;
      } else {
        finalConfig = DEFAULT_CONFIG;
      }
      return finalConfig;
    } catch {
      return DEFAULT_CONFIG;
    }
  });

// Auto-sync non-sensitive config to backend via safe UI endpoint
  useEffect(() => {
    try {
      if (config.webhookUrl) {
        const effectiveUrl = getEffectiveUrl(config.webhookUrl);
        const finalUrl = effectiveUrl.replace(/\/$/, "") + "/api/bridge/ui-settings";
        fetch(finalUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            forceClosePnL: config.forceClosePnL,
            enableTelegramAlerts: config.enableTelegramAlerts,
          }),
        }).catch(() => {});
      }
    } catch {
      // ignore
    }
  }, [
    config.forceClosePnL,
    config.enableTelegramAlerts,
    config.webhookUrl,
  ]);

  // Persist config
  useEffect(() => {
    localStorage.setItem(
      `arkon_config_v${CURRENT_VERSION}`,
      JSON.stringify(config),
    );
  }, [config]);

  const resetConfig = useCallback(() => {
    setConfig(DEFAULT_CONFIG);
    if (addLog) {
      addLog("🔄 تم إعادة ضبط الإعدادات إلى الافتراضية", "SYSTEM");
    }
  }, [addLog]);

  const updateConfig = useCallback(
    (partial: Partial<AppConfig>) => {
      setConfig((prev) => ({ ...prev, ...partial }));
    },
    [],
  );

  return {
    config,
    setConfig,
    updateConfig,
    resetConfig,
    DEFAULT_CONFIG,
    DEFAULT_STRATEGY_PERFORMANCE,
  };
}

