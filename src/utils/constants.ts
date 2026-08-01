/**
 * ARKON v50.0.0 — الثوابت الأساسية للتطبيق
 * تم استخراجها من App.tsx لتقليل التكرار وتحسين الصيانة
 */

export const CURRENT_VERSION = "50.00-LOCAL";
export const BRIDGE_PROTOCOL_VERSION = "50.0.0";
export const GOLD_MAX_PRICE_AGE_MS = 3000;
export const MARKET_POLL_INTERVAL_MS = 30000;
export const WS_RECONNECT_BASE_DELAY_MS = 5000;
export const WS_RECONNECT_MAX_DELAY_MS = 60000;
export const MANAGED_TRADES_POLL_INTERVAL_MS = 15000;
export const SIGNAL_QUEUE_MAX_SIZE = 50;
export const SIGNAL_EXPIRY_MS = 30000;
export const MAX_SENT_SIGNALS_CACHE = 1000;
export const MAX_LOG_ENTRIES = 200;
export const PROCESS_ASSET_STAGGER_MS = 2000;
export const BRIDGE_HEALTH_TIMEOUT_MS = 15000;
export const DEFAULT_WEBHOOK_URL = "http://127.0.0.1:3000";

export const DEFAULT_STRATEGY_PERFORMANCE_CONFIG = {
  wins: 0,
  losses: 0,
  totalProfitPoints: 0,
  totalLossPoints: 0,
  successScore: 0,
  isEnabled: true,
  type: "SCALPING" as const,
  totalTrades: 0,
  winRate: 0,
  profitFactor: 0,
  sharpeRatio: 0,
  maxDrawdown: 0,
  lastTradeTime: 0,
  consecutiveLosses: 0,
};

export const MAPPED_SYMBOLS: Record<string, string> = {
  BTC: "BTCUSD",
  ETH: "ETHUSD",
  SOL: "SOLUSD",
  XRP: "XRPUSD",
  XAUUSD: "XAUUSD",
  GOLD: "XAUUSD",
};

export const MT5_SYMBOL_ALIASES: Record<string, string[]> = {
  GOLD: ["XAUUSD", "XAUUSDM", "XAUUSD.M", "GOLD", "XAUUSD.pro", "XAUUSD.a"],
  BTC: ["BTCUSD", "BTCUSDM", "BTCUSD.M", "BTC", "BTCUSD.pro", "BTCUSD.a"],
  ETH: ["ETHUSD", "ETHUSDM", "ETHUSD.M", "ETH", "ETHUSD.pro", "ETHUSD.a"],
  SOL: ["SOLUSD", "SOLUSDM", "SOLUSD.M", "SOL"],
  XRP: ["XRPUSD", "XRPUSDM", "XRPUSD.M", "XRP"],
};

export const GOLD_MARKET_DATA_SYMBOLS: string[] = ["XAUUSD", "GOLD", "XAUUSDT"];
export const GOLD_PRICE_MAX_AGE_MS = 3000;
export const GOLD_SPREAD_FILTER_POINTS = 50;
export const GOLD_SESSION_START_UTC = 8;
export const GOLD_SESSION_END_UTC = 17;
export const GOLD_DEFAULT_DVOL = 15;
export const GOLD_MAX_LOT_SIZE = 0.5;
export const GOLD_CONCURRENT_POSITIONS_MAX = 5;

export const BRIDGE_SYNC_TIMEOUT_MS = 2500;

