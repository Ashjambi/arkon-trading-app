import { TradingSignal } from '../types';

export const allocateWeightedSizes = (
  signals: TradingSignal[],
  totalSize: number,
  minFloor: number = 1
): TradingSignal[] => {
  if (signals.length === 0) return [];
  if (signals.length === 1) {
    const clone = { ...signals[0] };
    clone.recommendedSize = totalSize;
    return [clone];
  }

  let hasValidScore = false;
  const weights = signals.map(sig => {
    if (sig.qualityScore !== undefined && sig.qualityScore !== null && sig.qualityScore > 0) {
      hasValidScore = true;
      return Math.max(sig.qualityScore, minFloor);
    }
    return minFloor; // Doesn't matter if all are invalid, as we fallback below
  });

  if (!hasValidScore) {
    // Safe fallback: equal split
    const equalSize = totalSize / signals.length;
    return signals.map(sig => ({
      ...sig,
      recommendedSize: equalSize
    }));
  }

  const totalWeight = weights.reduce((sum, w) => sum + w, 0);

  return signals.map((sig, idx) => {
    const weight = weights[idx];
    const normalizedWeight = weight / totalWeight;
    return {
      ...sig,
      recommendedSize: totalSize * normalizedWeight
    };
  });
};
