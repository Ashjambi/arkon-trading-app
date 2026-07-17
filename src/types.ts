
export interface CVDData {
    currentCVD: number;
    previousCVD: number;
    delta: number;
    trend: 'RISING' | 'FALLING' | 'FLAT';
}

export interface LiquidityData {
    orderBookImbalance: number;
    liquidityPools: number[]; // Price levels with high liquidity
    signal: 'BUY' | 'SELL' | 'NEUTRAL';
}

export interface QuantModelSignal {
    momentumScore: number; // Neural network output
    meanReversionSignal: number;
    signal: 'BUY' | 'SELL' | 'REVERT_TO_MEAN' | 'NEUTRAL';
}

export enum SignalDirection {
  LONG = 'LONG',
  SHORT = 'SHORT'
}

export enum SignalStrength {
  STRONG = 'STRONG',
  MEDIUM = 'MEDIUM',
  STANDARD = 'STANDARD'
}

export type StrategyType = 
    'BTC_TREND' | 'BTC_MEAN_REV' | 'BTC_TREND_FOLLOWING' | 'BTC_OFI' | 'BTC_AVR' | 'BTC_SCALPER' |
    'ETH_TREND' | 'ETH_MEAN_REV' | 'ETH_TREND_FOLLOWING' | 'ETH_CORR_ARB' | 'ETH_VOL_BREAK' | 'ETH_SCALPER' |
    'PAIRS_TRADING' | 'VOLATILITY_BREAKOUT' | 'COINTEGRATION' |
    'NEWS_SHOCK' | 'WAIT';

export type LogType = 'QUANT' | 'RISK' | 'EXEC' | 'SYSTEM' | 'INFO' | 'ERROR' | 'WHALE' | 'NEWS' | 'COOLDOWN' | 'SECURE' | 'BOOST' | 'PROFIT_LOCK' | 'HEDGE' | 'FLIP' | 'STRATEGY_SWITCH';

export interface LogEntry {
  id: string;
  timestamp: number;
  type: LogType;
  message: string;
  details?: string | object; 
  latency?: number;
}

export interface EconomicEvent {
    id: string;
    name: string;
    impact: 'HIGH' | 'MEDIUM' | 'LOW';
    timestamp: number;
    currency: string;
}

export interface MarketAnalysisState {
    asset: string;
    price: number;
    fisher: number;
    vwapDeviation: number;
    vwapZScore: number;
    vwapMain: number;
    vwapUpper: number;
    vwapLower: number;
    volatility: number; // Garman-Klass Realized Volatility equivalent distance
    bullishSweep: boolean;
    bearishSweep: boolean;
    swingLow: number;
    swingHigh: number;
    rSquared: number;
    dvol: number;
    hurst: number; 
    volRatio: number; 
    yearlyHigh: number;
    yearlyLow: number;
    pricePositionRank: number; 
    adr?: number; // Average Daily Range
    adrExhaustion?: 'UP' | 'DOWN' | 'NONE'; // Daily range exhaustion
    regime: 'MEAN_REVERSION' | 'MOMENTUM_TREND' | 'HIGH_VOLATILITY' | 'LOW_VOLATILITY' | 'CHOPPY/NOISE';
    qualityScore: number;
    primaryBlocker: string;
    isCooldownActive: boolean;
    cooldownRemaining: number;
    isCorrelatedBlocked: boolean;
    liquidityGap: number;
    toxicityScore: number;
    estimatedSlippage: number;
    dataLatencyMs: number;
    scoreBreakdown: any[];
    dominantFactor: string;
    reversalProbability: number;
    trendDirection: 'UP' | 'DOWN' | 'NEUTRAL';
    fundingRate: number;
    openInterest: number;
    isNewsPaused: boolean;
    isDailyLossPaused: boolean;
    activeEvent?: EconomicEvent;
    allSummaries?: any[];
    orderFlowSignal?: 'BUY_SIGNAL' | 'SELL_SIGNAL' | null;
    strategyLogs?: string[];
    // S-10X Cointegration Z-Score Engine
    cointBeta?: number;
    cointRollingMean?: number;
    cointRollingStd?: number;
    cointZScore?: number;
    cointStrength?: number;
    cointHalfLife?: number;
    cointBetaStability?: number;
    correlationId?: string | null;
    ofi?: number | null;
    normalizedOfi?: number | null;
    orderBookImbalance?: number | null;
    microPrice?: number | null;
    microPriceDeviation?: number | null;
    topLevelImbalance?: number | null;
    depthPressure?: number | null;
    recentSignedVolume?: number | null;
    recentTradeCount?: number | null;
    tradeFlowAvailable?: boolean;
    toxicityMetric?: number | null;
    mtfStatus: {
        dailyTrend: 'UP' | 'DOWN' | 'NEUTRAL';
        h4Regime: string;
        m15Trigger: boolean;
    };
}

export interface TradingSignal {
  id: string;
  timestamp: number;
  asset: string;
  direction: SignalDirection;
  strength: SignalStrength;
  entry: number;
  stopLoss: number;
  takeProfit: number;
  tp1: number;
  tp2: number;
  qualityScore: number;
  reasoning: string;
  strategy: StrategyType;
  lotMultiplier?: number;

  recommendedSize?: number;
  executionHints?: {
      executionMode: 'NORMAL' | 'PASSIVE' | 'PRICE_IMPROVED' | 'DELAYED' | 'SKIP';
      referencePrice?: number | null;
      executionPenaltyFactor: number;
      shouldDelay: boolean;
      shouldSkip: boolean;
      reason: string;
  };

  details: {
    volumeMultiplier: number;
    fundingRate: number;
    correlationScore: number;
    fisher: number;
    volatilityPremium: number;
    statisticalEdge: number;
    quantRegime: string;
    vwap: number;
    vwapDeviation: number;
    hurstExponent: number;
    kellyBet?: number;
    secureThreshold?: number;
    partialClosePercent?: number;
  };
}

export interface StrategyPerformance {
    wins: number;
    losses: number;
    totalProfitPoints: number;
    totalLossPoints: number;
    successScore: number; 
    isEnabled: boolean;
    type: 'SCALPING' | 'SWING';
    totalTrades: number;
    winRate: number;
    profitFactor: number;
    sharpeRatio: number;
    maxDrawdown: number;
    lastTradeTime: number;
    consecutiveLosses: number;
}

export interface AppConfig {
  // Telegram
  telegramBotToken: string;
  telegramChatId: string;
  enableTelegramAlerts: boolean;

  // Bridge & Connectivity
  webhookUrl: string;
  webhookSecret: string;
  bridgeLatencyThreshold: number;

  // Execution Engine
  autoExecution: boolean;
  hunterMode: boolean; // Aggressive scalping mode with lower quality threshold
  minSignalScore: number;
  cooldownHours: number;
  cooldownSameAssetMins: number;

  // Risk Management
  riskRewardRatio: number;
  maxOpenTrades: number; // Max total concurrent trades across all symbols
  maxTradesPerWave: number; // Max trades per direction per symbol (Grid depth)
  dynamicVolSpacing: number; // Minimum distance fraction of daily expected DVOL move 
  maxAllocationPerTradePercent: number; 
  fixedLotSizeBTC: number; 
  fixedLotSizeETH: number;
  equityProtectionPercent: number; 
  dailyLossLimitUSD: number;
  maxDrawdownDailyPercent: number;

  // Profit Protection & Trailing
  forceClosePnL: number;

  // Hedge & Flip Protocol
  autoHedgeEnabled: boolean;
  hedgeRatio: number; 
  flipEnabled: boolean;
  flipSensitivityScore: number; 

  // Trend Following Strategy
  enableTrendFollowing: boolean;
  trendFollowingThreshold: number; // Z-score threshold to start trend following (e.g., 0.5)

  // Gate Thresholds
  hurst: number;
  fisher: number;
  rSquared: number;
  dvol: number;
  toxicity: number;
  slippage: number;
  vwapZScore: number;
  ofi: number;
  volRatio: number;

  // New Strategy Parameters
  avrVolatilityThreshold: number;
  avrLookbackPeriod: number;
  ofiImbalanceThreshold: number;
  ofiSensitivity: number;
  corrThreshold: number;
  corrLookback: number;

  // Strategy Management
  strategyPerformance: Record<StrategyType, StrategyPerformance>;
  strategyGates: Record<StrategyType, StrategyGates>;
  autoDisableThreshold: number; // Threshold below which a strategy is auto-disabled

  // DCA Zones
  dcaZones: {
    asset: string;
    priceRange: [number, number];
  }[];
  
  // Advanced
  disableInitialSL: boolean;
  useVirtualSL: boolean;
  commissionRate: number; // Commission per trade (e.g., 0.0005 for 0.05%)
  
  // Order Flow Institutional Strategy
  orderFlowConfig: {
    enabled: boolean;
    ofiThreshold: number;
    imbalanceRatio: number;
    minVolume: number;
    vwapEnabled: boolean;
  };
}

export interface SignalLog {
  id: string;
  timestamp: number;
  asset: string;
  strategy: StrategyType;
  direction: SignalDirection;
  entryPrice: number;
  regime: string;
  qualityScore: number;
  outcome?: 'WIN' | 'LOSS' | 'BE';
  pnlPoints?: number;
  details: any;
}

export interface StrategyGates {
    hurst: number;
    fisher: number;
    rSquared: number;
    dvol: number;
    toxicity: number;
    slippage: number;
    vwapZScore: number;
    ofi: number;
    volRatio: number;
}

export interface DeribitBookSummary {
  instrument_name: string;
  last: number;
  funding_8h: number;
  open_interest: number;
  volume: number;
  _data_age_ms?: number;
  regime?: string;
}

export interface DeribitCandleData {
  status: string;
  close: number[];
  open?: number[];
  high?: number[];
  low?: number[];
  volume?: number[];
  ticks?: number[];
}

export interface DeribitOrderBook {
  bids: [number, number][];
  asks: [number, number][];
}
