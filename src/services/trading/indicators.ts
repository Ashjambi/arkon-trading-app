import { mean, stdDev } from "./mathUtils";
import { DeribitCandleData } from "../../types";
import { sendTelegramAlert } from "./alertService";

/**
 * Calculates the Exponential Moving Average (EMA).
 * @param data Array of prices.
 * @param period EMA period.
 * @returns Array of EMA values.
 */
export const calculateEMA = (data: number[], period: number): number[] => {
  if (data.length === 0) return [];
  try {
    const k = 2 / (period + 1);
    const ema = [data[0]];
    for (let i = 1; i < data.length; i++) {
      ema.push(data[i] * k + ema[i - 1] * (1 - k));
    }
    return ema;
  } catch (error) {
    sendTelegramAlert(`Math Error in calculateEMA: ${error}`);
    return Array(data.length).fill(0);
  }
};

/**
 * Calculates the Relative Strength Index (RSI).
 * @param data Array of prices.
 * @param period RSI period (default 14).
 * @returns Array of RSI values.
 */
export const calculateRSI = (data: number[], period: number = 14): number[] => {
  if (data.length <= period) return Array(data.length).fill(50);
  try {
    const rsi: number[] = Array(period).fill(50);
    let gains = 0;
    let losses = 0;

    for (let i = 1; i <= period; i++) {
      const diff = data[i] - data[i - 1];
      if (diff >= 0) gains += diff;
      else losses -= diff;
    }

    let avgGain = gains / period;
    let avgLoss = losses / period;
    rsi.push(100 - 100 / (1 + avgGain / (avgLoss || 1)));

    for (let i = period + 1; i < data.length; i++) {
      const diff = data[i] - data[i - 1];
      const gain = diff > 0 ? diff : 0;
      const loss = diff < 0 ? -diff : 0;
      avgGain = (avgGain * (period - 1) + gain) / period;
      avgLoss = (avgLoss * (period - 1) + loss) / period;
      rsi.push(100 - 100 / (1 + avgGain / (avgLoss || 1)));
    }
    return rsi;
  } catch (error) {
    sendTelegramAlert(`Math Error in calculateRSI: ${error}`);
    return Array(data.length).fill(50);
  }
};

export const calculateADR = (highs: number[], lows: number[], period: number = 14): number => {
  if (highs.length < period || lows.length < period || period <= 0) return 0;
  
  const ranges: number[] = [];
  for (let i = highs.length - period; i < highs.length; i++) {
    ranges.push(highs[i] - lows[i]);
  }
  return mean(ranges);
};

export const calculateGarmanKlassVolatility = (
  opens: number[],
  highs: number[],
  lows: number[],
  closes: number[],
  period: number = 14
): number => {
  if (closes.length <= period) return 0;
  try {
    let sumVar = 0;
    const startIdx = closes.length - period;
    
    for (let i = startIdx; i < closes.length; i++) {
      const o = opens[i];
      const h = highs[i];
      const l = lows[i];
      const c = closes[i];
      
      // GK Variance for one period:
      // 0.5 * [ln(H/L)]^2 - (2*ln(2) - 1) * [ln(C/O)]^2
      const term1 = 0.5 * Math.pow(Math.log(h / l), 2);
      const term2 = (2 * Math.LN2 - 1) * Math.pow(Math.log(c / o), 2);
      sumVar += (term1 - term2);
    }
    
    // Average variance over the period
    const avgVar = sumVar / period;
    
    // Standard deviation is the square root
    return Math.sqrt(avgVar);
  } catch (error) {
    sendTelegramAlert(`Math Error in calculateGarmanKlassVolatility: ${error}`);
    return 0;
  }
};



/**
 * Calculates the Average Directional Index (ADX).
 * @param highs Array of high prices.
 * @param lows Array of low prices.
 * @param closes Array of close prices.
 * @param period ADX period (default 14).
 * @returns ADX value.
 */
export const calculateADX = (
  highs: number[],
  lows: number[],
  closes: number[],
  period: number = 14,
): number => {
  if (closes.length <= period * 2) return 20;
  try {
    const tr: number[] = [];
    const plusDM: number[] = [];
    const minusDM: number[] = [];

    for (let i = 1; i < closes.length; i++) {
      const h = highs[i];
      const l = lows[i];
      const ph = highs[i - 1];
      const pl = lows[i - 1];
      const pc = closes[i - 1];

      tr.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));

      const moveUp = h - ph;
      const moveDown = pl - l;

      if (moveUp > 0 && moveUp > moveDown) plusDM.push(moveUp);
      else plusDM.push(0);

      if (moveDown > 0 && moveDown > moveUp) minusDM.push(moveDown);
      else minusDM.push(0);
    }

    const smoothTR = calculateEMA(tr, period);
    const smoothPlusDM = calculateEMA(plusDM, period);
    const smoothMinusDM = calculateEMA(minusDM, period);

    const dx: number[] = [];
    for (let i = 0; i < smoothTR.length; i++) {
      const diPlus = (smoothPlusDM[i] / smoothTR[i]) * 100;
      const diMinus = (smoothMinusDM[i] / smoothTR[i]) * 100;
      const diff = Math.abs(diPlus - diMinus);
      const sum = diPlus + diMinus;
      dx.push(sum === 0 ? 0 : (diff / sum) * 100);
    }

    const adx = calculateEMA(dx, period);
    return adx[adx.length - 1];
  } catch (error) {
    sendTelegramAlert(`Math Error in calculateADX: ${error}`);
    return 20;
  }
};

export const calculateBollingerBands = (
  data: number[],
  period: number = 20,
  stdDevMult: number = 2,
) => {
  if (data.length < period) return { middle: 0, upper: 0, lower: 0 };
  const slice = data.slice(-period);
  const middle = mean(slice);
  const sd = stdDev(slice);
  return {
    middle,
    upper: middle + sd * stdDevMult,
    lower: middle - sd * stdDevMult,
  };
};

export const calculateVWAP = (candles: DeribitCandleData | null): number => {
  if (!candles || !candles.close || !candles.volume) return 0;
  let totalVolume = 0;
  let totalValue = 0;

  for (let i = 0; i < candles.close.length; i++) {
    const price = (candles.high[i] + candles.low[i] + candles.close[i]) / 3;
    const volume = candles.volume[i];
    totalValue += price * volume;
    totalVolume += volume;
  }

  return totalVolume === 0 ? 0 : totalValue / totalVolume;
};

export const calculateVWAPBands = (candles: DeribitCandleData | null, stdevMultiplier: number = 1.0): { vwapMain: number, vwapUpper: number, vwapLower: number } => {
  if (!candles || !candles.close || !candles.volume || !candles.high || !candles.low) return { vwapMain: 0, vwapUpper: 0, vwapLower: 0 };
  
  let totalVolume = 0;
  let totalValue = 0;
  const typicalPrices: number[] = [];

  for (let i = 0; i < candles.close.length; i++) {
    const price = (candles.high[i] + candles.low[i] + candles.close[i]) / 3;
    typicalPrices.push(price);
    const volume = candles.volume[i];
    totalValue += price * volume;
    totalVolume += volume;
  }

  const vwapMain = totalVolume === 0 ? 0 : totalValue / totalVolume;
  
  // Calculate standard deviation of typical prices
  let sumSquaredDeviations = 0;
  for (let i = 0; i < typicalPrices.length; i++) {
    sumSquaredDeviations += Math.pow(typicalPrices[i] - vwapMain, 2);
  }
  const variance = sumSquaredDeviations / typicalPrices.length;
  const stdev = Math.sqrt(variance);
  
  return {
    vwapMain,
    vwapUpper: vwapMain + (stdev * stdevMultiplier),
    vwapLower: vwapMain - (stdev * stdevMultiplier)
  };
};

export const detectLiquiditySweep = (highs: number[], lows: number[], closes: number[], opens: number[], lookback: number = 10): { bullishSweep: boolean, bearishSweep: boolean, swingLow: number, swingHigh: number } => {
  if (highs.length < lookback + 2) return { bullishSweep: false, bearishSweep: false, swingLow: 0, swingHigh: 0 };
  
  const currentIdx = highs.length - 1;
  const prevIdx = currentIdx - 1;
  
  // Find recent swing low and high (excluding the most recent 2 candles)
  const recentLows = lows.slice(currentIdx - lookback - 1, prevIdx);
  const recentHighs = highs.slice(currentIdx - lookback - 1, prevIdx);
  
  const swingLow = Math.min(...recentLows);
  const swingHigh = Math.max(...recentHighs);
  
  // Bullish Sweep: Price dips below recent low but closes back up
  const bullishSweep = lows[currentIdx] < swingLow && closes[currentIdx] > lows[prevIdx] && closes[currentIdx] > opens[currentIdx];
  
  // Bearish Sweep: Price spikes above recent high but closes back down
  const bearishSweep = highs[currentIdx] > swingHigh && closes[currentIdx] < highs[prevIdx] && closes[currentIdx] < opens[currentIdx];
  
  return { bullishSweep, bearishSweep, swingLow, swingHigh };
};

export const calculateMACD = (
  data: number[],
  fast: number = 12,
  slow: number = 26,
  signal: number = 9,
) => {
  if (data.length < slow) return { macd: 0, signal: 0, histogram: 0 };
  const fastEMA = calculateEMA(data, fast);
  const slowEMA = calculateEMA(data, slow);

  const macdLine: number[] = [];
  for (let i = 0; i < fastEMA.length; i++) {
    macdLine.push(fastEMA[i] - slowEMA[i]);
  }

  const signalLine = calculateEMA(macdLine, signal);
  const currentMACD = macdLine[macdLine.length - 1];
  const currentSignal = signalLine[signalLine.length - 1];

  return {
    macd: currentMACD,
    signal: currentSignal,
    histogram: currentMACD - currentSignal,
  };
};

export const calculateIchimoku = (highs: number[], lows: number[]) => {
  if (highs.length < 52) return { tenkan: 0, kijun: 0 };

  const getPeriodHighLow = (h: number[], l: number[], p: number) => {
    const sliceH = h.slice(-p);
    const sliceL = l.slice(-p);
    return (Math.max(...sliceH) + Math.min(...sliceL)) / 2;
  };

  return {
    tenkan: getPeriodHighLow(highs, lows, 9),
    kijun: getPeriodHighLow(highs, lows, 26),
    senkouA: 0, // Simplified
    senkouB: getPeriodHighLow(highs, lows, 52),
  };
};

export const calculateCMF = (
  highs: number[],
  lows: number[],
  closes: number[],
  volumes: number[],
  period: number = 20,
) => {
  if (closes.length < period) return 0;

  let mfvSum = 0;
  let volSum = 0;

  for (let i = closes.length - period; i < closes.length; i++) {
    const mfv =
      (closes[i] - lows[i] - (highs[i] - closes[i])) /
      (highs[i] - lows[i] || 1);
    mfvSum += mfv * volumes[i];
    volSum += volumes[i];
  }

  return volSum === 0 ? 0 : mfvSum / volSum;
};

export const calculateSuperTrend = (
  opens: number[],
  highs: number[],
  lows: number[],
  closes: number[],
  period: number = 10,
  multiplier: number = 3,
) => {
  if (closes.length < period) return { trend: "NEUTRAL", value: 0 };

  const gkVolatility = calculateGarmanKlassVolatility(opens, highs, lows, closes, period);
  const volatilityAbsolute = gkVolatility * closes[closes.length - 1]; // Convert to absolute price distance
  const hl2 = (highs[highs.length - 1] + lows[lows.length - 1]) / 2;

  const upperBand = hl2 + multiplier * volatilityAbsolute;
  const lowerBand = hl2 - multiplier * volatilityAbsolute;

  const currentPrice = closes[closes.length - 1];
  const trend =
    currentPrice > upperBand
      ? "DOWN"
      : currentPrice < lowerBand
        ? "UP"
        : "NEUTRAL";

  return { trend, value: trend === "UP" ? lowerBand : upperBand };
};

export const calculateWilliamsR = (
  highs: number[],
  lows: number[],
  closes: number[],
  period: number = 14,
): number => {
  if (closes.length < period) return -50;
  const currentClose = closes[closes.length - 1];
  const highestHigh = Math.max(...highs.slice(-period));
  const lowestLow = Math.min(...lows.slice(-period));

  const range = highestHigh - lowestLow;
  if (range === 0) return -50;
  return ((highestHigh - currentClose) / range) * -100;
};

/**
 * Calculates the Fisher Transform of a data series.
 * @param data Array of prices.
 * @param period Fisher period (default 10).
 * @returns Array of Fisher Transform values.
 */
export const calculateFisherTransform = (data: number[], period: number = 10): number[] => {
  if (data.length < period) return Array(data.length).fill(0);
  try {
    const min = Math.min(...data.slice(-period));
    const max = Math.max(...data.slice(-period));
    const range = max - min || 1;
    const x = ((data[data.length - 1] - min) / range) * 2 - 1;
    
    const clampedX = Math.max(Math.min(x, 0.999), -0.999);
    const fisher = 0.5 * Math.log((1 + clampedX) / (1 - clampedX));
    
    return [fisher];
  } catch (error) {
    sendTelegramAlert(`Math Error in calculateFisherTransform: ${error}`);
    return [0];
  }
};

/**
 * Calculates the Hurst Exponent using multi-scale R/S analysis.
 * This is the statistically correct implementation:
 * 1. Subsample at multiple time scales (τ)
 * 2. Compute R/S for each subsample
 * 3. Regress log(R/S) vs log(τ) — the slope is H
 * 
 * H < 0.45 → Mean Reverting
 * H ≈ 0.5  → Random Walk
 * H > 0.55 → Trending
 */
export const calculateHurst = (closes: number[]): number => {
  const n = closes.length;
  if (n < 100) return 0.5; // Need sufficient data

  // Compute log returns
  const logReturns: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    logReturns.push(Math.log(closes[i] / closes[i - 1]));
  }

  const N = logReturns.length;
  
  // Define time scales (τ) — at least 5 scales, evenly spaced in log space
  const minTau = Math.max(4, Math.floor(N / 64));
  const maxTau = Math.floor(N / 4);
  if (maxTau <= minTau) return 0.5;
  
  const tauValues: number[] = [];
  const rsValues: number[] = [];
  
  // Use log-spaced tau values for better statistical properties
  const logMin = Math.log(minTau);
  const logMax = Math.log(maxTau);
  const numScales = Math.min(8, Math.floor(maxTau - minTau + 1));
  
  for (let i = 0; i < numScales; i++) {
    const tau = Math.round(Math.exp(logMin + (logMax - logMin) * i / (numScales - 1)));
    if (tau < 2) continue;
    
    const numWindows = Math.floor(N / tau);
    if (numWindows < 2) continue;
    
    let rsSum = 0;
    let validWindows = 0;
    
    for (let w = 0; w < numWindows; w++) {
      const start = w * tau;
      const end = start + tau;
      const windowReturns = logReturns.slice(start, end);
      
      if (windowReturns.length < 2) continue;
      
      // Mean-adjusted cumulative deviations
      const windowMean = windowReturns.reduce((a, b) => a + b, 0) / windowReturns.length;
      const deviations = windowReturns.map(r => r - windowMean);
      
      const cumSum: number[] = [];
      let cs = 0;
      for (const d of deviations) {
        cs += d;
        cumSum.push(cs);
      }
      
      const r = Math.max(...cumSum) - Math.min(...cumSum);
      
      // Compute standard deviation for this window
      const variance = deviations.reduce((sum, d) => sum + d * d, 0) / (deviations.length - 1);
      const s = Math.sqrt(Math.max(variance, 1e-10));
      
      if (s > 0 && r > 0) {
        rsSum += Math.log(r / s);
        validWindows++;
      }
    }
    
    if (validWindows > 0) {
      tauValues.push(Math.log(tau));
      rsValues.push(rsSum / validWindows);
    }
  }
  
  if (tauValues.length < 3) return 0.5; // Not enough data points for regression
  
  // Perform linear regression: log(R/S) = H * log(τ) + c
  const nPoints = tauValues.length;
  const meanX = tauValues.reduce((a, b) => a + b, 0) / nPoints;
  const meanY = rsValues.reduce((a, b) => a + b, 0) / nPoints;
  
  let num = 0;
  let den = 0;
  for (let i = 0; i < nPoints; i++) {
    const dx = tauValues[i] - meanX;
    num += dx * (rsValues[i] - meanY);
    den += dx * dx;
  }
  
  if (den === 0) return 0.5;
  
  const hurst = num / den;
  
  // Clamp to valid range [0, 1]
  return Math.max(0, Math.min(1, hurst));
};
