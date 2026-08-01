
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
    'GOLD_TREND' | 'GOLD_MEAN_REV' | 'GOLD_SCALPER' |
    'SOL_TREND' | 'SOL_MEAN_REV' | 'SOL_SCALPER' |
  'PAIRS_TRADING' | 'VOLATILITY_BREAKOUT' | 'COINTEGRATION' |
  'MEAN_REVERSION_ALPHA' | 'BREAKOUT_CAPTURE' | 'ARBITRAGE_SCANNER' | 'GRID_TRADING' |
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

  // Optional diagnostic/quality metadata attached at runtime (e.g. signalQualityBreakdown).
  metadata?: Record<string, any>;

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

// ─── Diagnostics Event Taxonomy (v2) ───────────────────────────────

export type EventCategory =
  | 'SIGNAL_FILTERED'       // Expected market/strategy rejection: ADR, Hurst, score, regime, contradiction
  | 'RISK_BLOCKED'          // Intentional pre-trade risk/compliance limit block
  | 'EXECUTION_FAILED'      // Real submitted execution that failed
  | 'BRIDGE_FAILURE'        // Unique auth, transport, timeout, 5xx, MT5 transport incident
  | 'CIRCUIT_BREAKER_TRANSITION' // State transition: CLOSED→OPEN, OPEN→HALF_OPEN, HALF_OPEN→CLOSED
  | 'CIRCUIT_BREAKER_SUPPRESSED'; // Repeated attempt suppressed while breaker OPEN

export interface FilteredSignalEvent {
  category: 'SIGNAL_FILTERED';
  timestamp: number;
  reasonCode: string;
  reason: string;
  asset: string;
  strategy: string;
  direction?: string;
  filterType: 'ADR' | 'DVOL' | 'SLIPPAGE' | 'REGIME' | 'SCORE' | 'CONTRADICTION' | 'HURST' | 'RSQUARED' | 'COOLDOWN' | 'CORRELATION' | 'COMPLIANCE' | 'OTHER';
  correlationId: string;
}

export interface RiskBlockEvent {
  category: 'RISK_BLOCKED';
  timestamp: number;
  reasonCode: string;
  reason: string;
  asset: string;
  blockType: 'EXPOSURE_LIMIT' | 'POSITION_LIMIT' | 'DAILY_LOSS' | 'NOTIONAL_LIMIT' | 'PRE_TRADE' | 'STRATEGY_BUDGET' | 'PORTFOLIO_DRAWDOWN' | 'TAIL_RISK' | 'CONTROL_LAYER';
  correlationId: string;
}

export interface BridgeFailureEvent {
  category: 'BRIDGE_FAILURE';
  timestamp: number;
  failureType: 'BRIDGE_AUTH' | 'BRIDGE_CONNECTIVITY' | 'BRIDGE_HTTP_5XX' | 'MT5_TRANSPORT' | 'TIMEOUT' | 'UNKNOWN';
  message: string;
  correlationId: string;
  requestId?: string;
  isUniqueIncident: boolean;
}

export interface BreakerTransitionEvent {
  category: 'CIRCUIT_BREAKER_TRANSITION';
  timestamp: number;
  fromState: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  toState: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  reason: string;
  asset: string;
}

export interface SuppressedDuplicateEvent {
  category: 'CIRCUIT_BREAKER_SUPPRESSED';
  timestamp: number;
  originalTimestamp: number;
  correlationId: string;
  reason: string;
}

export interface DailyEventRecord {
  /** Canonical key: asset|strategy|direction|reasonCode|category */
  key: string;
  firstSeen: number;
  lastSeen: number;
  occurrenceCount: number;
  category: EventCategory;
  reasonCode: string;
  reason: string;
  asset: string;
  strategy: string;
  direction?: string;
}

export interface DiagnosticsCountersV2 {
  // Active state (snapshot, not cumulative)
  activeRiskBlocks: number;
  circuitBreakerState: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  circuitBreakerAsset: string | null;

  // Unique events today (deduplicated by asset+strategy+direction+reasonCode per local trading day)
  uniqueSignalFiltersToday: number;
  uniqueRiskBlocksToday: number;
  uniqueBridgeIncidentsToday: number;

  // Circuit breaker metrics
  consecutiveBreakerFailures: number;
  breakerFailureThreshold: number;
  breakerRetryCount: number;
  breakerSuppressedDuplicateCount: number;
  breakerOpenTransitionCount: number;

  // Recent events for tooltip
  recentEvents: Array<{
    category: EventCategory;
    timestamp: number;
    reasonCode: string;
    reason: string;
    asset: string;
    strategy?: string;
    direction?: string;
    correlationId: string;
    occurrenceCount: number;
    isExpectedBlock: boolean;
  }>;
}

export interface AppConfig {
  // Telegram
  telegramBotToken: string;
  telegramChatId: string;
  enableTelegramAlerts: boolean;

  // Bridge & Connectivity
  webhookUrl: string;
  webhookSecret?: string;
  bridgeLatencyThreshold: number;

  // Execution Engine
  autoExecution: boolean;
  adaptiveRiskEnabled?: boolean;
  adaptiveRiskMaxExposurePct?: number;
  adaptiveRiskAtrMultiplierTrending?: number;
  adaptiveRiskAtrMultiplierRanging?: number;
  adaptiveRiskAtrMultiplierVolatile?: number;
  circuitBreakerFailureThreshold?: number;
  circuitBreakerRecoveryTimeoutMs?: number;
  circuitBreakerHalfOpenMaxCalls?: number;
  executionMaxRetries?: number;
  executionRetryBaseDelayMs?: number;
  executionRetryJitterMs?: number;
  enableRlExecution?: boolean;
  rlExecutionBoostMultiplier?: number;
  rlExecutionHedgeMultiplier?: number;
  rlExecutionHoldThreshold?: number;
  hunterMode: boolean; // Aggressive scalping mode with lower quality threshold
  hunterModeEnabled?: boolean;
  hunterMinSignalScore?: number;
  hunterAllowedRegimes?: string[];
  hunterMaxSpreadBps?: number;
  hunterMinLiquidityScore?: number;
  hunterMaxVolatilityScore?: number;
  hunterSizeMultiplier?: number;
  hunterTargetMultiplier?: number;
  hunterAllowAddOnEntry?: boolean;
  hunterAllowReentry?: boolean;
  hunterMaxConcurrentHunterTrades?: number;
  hunterCooldownSeconds?: number;
  hunterMinExecutionConfidence?: number;
  hunterDisableDuringDrawdown?: boolean;
  hunterDrawdownThreshold?: number;
  hunterLogDecisions?: boolean;
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
  fixedLotSizeGOLD: number;
  fixedLotSizeSOL: number;
  equityProtectionPercent: number; 
  dailyLossLimitUSD: number;
  maxDrawdownDailyPercent: number;

  // --- GOLD (XAUUSD) SPECIFIC CONFIG ---
  enableGoldTrading: boolean;
  goldMaxRiskPerTrade: number;
  goldMaxConcurrentPositions: number;
  goldSpreadFilter: number;
  goldSessionFilter: boolean;
  goldSessionStart: number;   // UTC hour
  goldSessionEnd: number;     // UTC hour
  goldPriceMaxAgeMs: number;
  goldMaxLot: number;

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
