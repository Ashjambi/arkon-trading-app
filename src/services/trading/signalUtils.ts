import { mean, stdDev } from "./mathUtils";

export const statisticalSignificanceTest = (data: number[]): number => {
  if (data.length < 30) return 0.5;
  const m = mean(data);
  const sd = stdDev(data);
  const tStat = m / (sd / Math.sqrt(data.length));
  // Simplified confidence score
  return Math.min(1, Math.abs(tStat) / 2);
};

export const calculateKelly = (winRate: number, riskReward: number): number => {
  // Kelly % = (p * b - q) / b
  // p = win rate, b = odds (RR), q = loss rate (1-p)
  const p = winRate;
  const b = riskReward;
  const q = 1 - p;
  const kelly = (p * b - q) / b;
  return Math.max(0, Math.min(0.25, kelly)); // Cap at 25% Kelly for safety
};

export const detectRSIDivergence = (
  closes: number[],
  rsiData: number[],
): "BULLISH" | "BEARISH" | "NONE" => {
  if (closes.length < 20 || rsiData.length < 20) return "NONE";

  const lastClose = closes[closes.length - 1];
  const prevClose = closes[closes.length - 10];
  const lastRSI = rsiData[rsiData.length - 1];
  const prevRSI = rsiData[rsiData.length - 10];

  // Bullish Divergence: Price lower low, RSI higher low
  if (lastClose < prevClose && lastRSI > prevRSI && lastRSI < 40)
    return "BULLISH";

  // Bearish Divergence: Price higher high, RSI lower high
  if (lastClose > prevClose && lastRSI < prevRSI && lastRSI > 60)
    return "BEARISH";

  return "NONE";
};

export const detectFVG = (
  highs: number[],
  lows: number[],
): "BULLISH" | "BEARISH" | "NONE" => {
  if (highs.length < 3) return "NONE";
  const i = highs.length - 1;
  if (highs[i - 2] < lows[i]) return "BULLISH";
  if (lows[i - 2] > highs[i]) return "BEARISH";
  return "NONE";
};

export const detectLiquiditySweep = (
  highs: number[],
  lows: number[],
  closes: number[],
  period: number = 15,
): "BULLISH" | "BEARISH" | "NONE" => {
  if (highs.length < period + 1) return "NONE";
  const i = highs.length - 1;
  const recentHighs = highs.slice(-(period + 1), -1);
  const recentLows = lows.slice(-(period + 1), -1);
  const maxRecentHigh = Math.max(...recentHighs);
  const minRecentLow = Math.min(...recentLows);

  // Bullish Sweep: Current low breaks recent low, then closes above it
  if (lows[i] < minRecentLow && closes[i] > minRecentLow) return "BULLISH";
  // Bearish Sweep: Current high breaks recent high, then closes below it
  if (highs[i] > maxRecentHigh && closes[i] < maxRecentHigh) return "BEARISH";
  return "NONE";
};
