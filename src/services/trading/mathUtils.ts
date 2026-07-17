import { sendTelegramAlert } from "./alertService";

/**
 * Calculates the arithmetic mean of an array of numbers.
 * @param data Array of numbers.
 * @returns The mean value, or 0 if the array is empty.
 */
export const mean = (data: number[]) =>
  data.length === 0 ? 0 : data.reduce((a, b) => a + b, 0) / data.length;

/**
 * Calculates the standard deviation of an array of numbers.
 * @param data Array of numbers.
 * @returns The standard deviation, or 0 if the array is empty.
 */
export const stdDev = (data: number[]) => {
  if (data.length === 0) return 0;
  try {
    const m = mean(data);
    const variance =
      data.reduce((sum, val) => sum + Math.pow(val - m, 2), 0) / data.length;
    return Math.sqrt(variance);
  } catch (error) {
    sendTelegramAlert(`Math Error in stdDev: ${error}`);
    return 0;
  }
};

/**
 * Calculates the Z-Score of a value relative to a historical dataset.
 * @param current The current value.
 * @param history Historical data array.
 * @returns The Z-Score, or 0 if standard deviation is 0.
 */
export const calculateZScore = (current: number, history: number[]) => {
  if (history.length < 2) return 0;
  try {
    const m = mean(history);
    const sd = stdDev(history);
    return sd === 0 ? 0 : (current - m) / sd;
  } catch (error) {
    sendTelegramAlert(`Math Error in calculateZScore: ${error}`);
    return 0;
  }
};

/**
 * Estimates Ornstein-Uhlenbeck process parameters.
 * @param data Array of prices.
 * @returns Object containing theta (speed of reversion) and mu (mean).
 */
export const calculateOUProcess = (data: number[]) => {
  if (data.length < 2) return { theta: 0, mu: 0 };
  try {
    const mu = mean(data);
    
    // Simple estimation of theta: -ln(correlation(x_t, x_{t-1}))
    let sumXY = 0;
    let sumX2 = 0;
    let sumY2 = 0;
    for (let i = 1; i < data.length; i++) {
      const x = data[i - 1] - mu;
      const y = data[i] - mu;
      sumXY += x * y;
      sumX2 += x * x;
      sumY2 += y * y;
    }
    const correlation = sumXY / Math.sqrt(sumX2 * sumY2 || 1);
    const theta = -Math.log(Math.max(Math.min(correlation, 0.99), 0.01));
    
    return { theta, mu };
  } catch (error) {
    sendTelegramAlert(`Math Error in calculateOUProcess: ${error}`);
    return { theta: 0, mu: 0 };
  }
};
