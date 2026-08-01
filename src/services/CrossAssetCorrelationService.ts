/**
 * ARKON v50.0.0 — Cross-Asset Correlation Service
 *
 * طبقة correlation بين BTC, ETH, GOLD, SOL
 * تُستخدم لتعديل حجم الصفقات ومنع تضخيم نفس التعرض عبر أصول متعددة
 */
import { logStructured } from '../utils/logger';

export interface AssetReturnSample {
  asset: string;
  timestamp: number;
  return: number;
}

export interface CorrelationMatrixEntry {
  baseAsset: string;
  otherAsset: string;
  correlation: number;
}

export interface OpenPosition {
  asset: string;
  direction: string;
  size: number;
}

const MAX_SAMPLES_PER_ASSET = 200;
const MIN_SAMPLES_FOR_CORRELATION = 40;

export class CrossAssetCorrelationService {
  private returnsBuffer: Map<string, AssetReturnSample[]> = new Map();

  /**
   * Record a return sample for a given asset.
   * Appends to the buffer and prunes to MAX_SAMPLES_PER_ASSET if exceeded.
   */
  recordReturn(asset: string, timestamp: number, returnValue: number): void {
    const normalizedAsset = asset.toUpperCase();
    if (!this.returnsBuffer.has(normalizedAsset)) {
      this.returnsBuffer.set(normalizedAsset, []);
    }

    const buffer = this.returnsBuffer.get(normalizedAsset)!;
    buffer.push({ asset: normalizedAsset, timestamp, return: returnValue });

    // Prune to max samples
    if (buffer.length > MAX_SAMPLES_PER_ASSET) {
      buffer.splice(0, buffer.length - MAX_SAMPLES_PER_ASSET);
    }
  }

  /**
   * Get return samples for a given asset (most recent n).
   */
  getReturns(asset: string, windowSize: number = 60): AssetReturnSample[] {
    const normalizedAsset = asset.toUpperCase();
    const buffer = this.returnsBuffer.get(normalizedAsset);
    if (!buffer || buffer.length === 0) return [];
    return buffer.slice(-Math.min(windowSize, buffer.length));
  }

  /**
   * Check if we have enough data for a reliable correlation.
   */
  hasMinimumSamples(asset: string): boolean {
    const normalizedAsset = asset.toUpperCase();
    const buffer = this.returnsBuffer.get(normalizedAsset);
    return buffer !== undefined && buffer.length >= MIN_SAMPLES_FOR_CORRELATION;
  }

  /**
   * Get the minimum samples threshold.
   */
  getMinimumSamples(): number {
    return MIN_SAMPLES_FOR_CORRELATION;
  }

  /**
   * Compute the absolute count of return samples currently stored for an asset.
   */
  getSampleCount(asset: string): number {
    const normalizedAsset = asset.toUpperCase();
    const buffer = this.returnsBuffer.get(normalizedAsset);
    return buffer ? buffer.length : 0;
  }

  /**
   * Compute Pearson correlation between two return arrays.
   * Returns null if insufficient data or zero variance.
   */
  private pearsonCorrelation(
    returnsA: number[],
    returnsB: number[]
  ): number | null {
    if (returnsA.length < 2 || returnsB.length < 2) return null;
    if (returnsA.length !== returnsB.length) return null;

    const n = returnsA.length;

    // Means
    let sumA = 0;
    let sumB = 0;
    for (let i = 0; i < n; i++) {
      sumA += returnsA[i];
      sumB += returnsB[i];
    }
    const meanA = sumA / n;
    const meanB = sumB / n;

    // Covariance and variances
    let cov = 0;
    let varA = 0;
    let varB = 0;
    for (let i = 0; i < n; i++) {
      const devA = returnsA[i] - meanA;
      const devB = returnsB[i] - meanB;
      cov += devA * devB;
      varA += devA * devA;
      varB += devB * devB;
    }

    // Avoid division by zero
    if (varA === 0 || varB === 0) return null;

    const corr = cov / Math.sqrt(varA * varB);

    // Clamp to [-1, 1] to handle floating point
    return Math.max(-1, Math.min(1, corr));
  }

  /**
   * Get pair correlation between two assets.
   * Returns null if insufficient data for either asset.
   */
  getPairCorrelation(
    baseAsset: string,
    otherAsset: string,
    windowSize: number = 60
  ): number | null {
    const normalizedBase = baseAsset.toUpperCase();
    const normalizedOther = otherAsset.toUpperCase();

    if (normalizedBase === normalizedOther) return 1.0;

    // Check minimum samples
    if (!this.hasMinimumSamples(normalizedBase) || !this.hasMinimumSamples(normalizedOther)) {
      return null;
    }

    const returnsBase = this.getReturns(normalizedBase, windowSize);
    const returnsOther = this.getReturns(normalizedOther, windowSize);

    if (returnsBase.length < 2 || returnsOther.length < 2) return null;

    // Align by timestamp (ensure both have data for the same time windows)
    // Since we're recording returns sequentially, we can just take the most recent
    // windowSize samples from each.
    const minLen = Math.min(returnsBase.length, returnsOther.length);
    if (minLen < 2) return null;

    const alignedA = returnsBase.slice(-minLen).map((r) => r.return);
    const alignedB = returnsOther.slice(-minLen).map((r) => r.return);

    return this.pearsonCorrelation(alignedA, alignedB);
  }

  /**
   * Compute full correlation matrix for all tracked assets.
   */
  computeCorrelationMatrix(windowSize: number = 60): CorrelationMatrixEntry[] {
    const assets: string[] = [];
    for (const [asset, buffer] of this.returnsBuffer.entries()) {
      if (buffer.length >= MIN_SAMPLES_FOR_CORRELATION) {
        assets.push(asset);
      }
    }

    const entries: CorrelationMatrixEntry[] = [];

    for (let i = 0; i < assets.length; i++) {
      for (let j = i + 1; j < assets.length; j++) {
        const corr = this.getPairCorrelation(assets[i], assets[j], windowSize);
        if (corr !== null) {
          entries.push({
            baseAsset: assets[i],
            otherAsset: assets[j],
            correlation: corr,
          });
          // Also add the symmetric entry for convenience
          entries.push({
            baseAsset: assets[j],
            otherAsset: assets[i],
            correlation: corr,
          });
        }
      }
    }

    return entries;
  }

  /**
   * Compute correlation multiplier for a target asset given existing open positions.
   *
   * Logic:
   * - Skip positions in the same asset.
   * - Skip positions with opposite direction (partial hedge).
   * - For same-direction positions:
   *   - |corr| < 0.7 → no reduction (multiplier = 1)
   *   - 0.7 ≤ |corr| < 0.9 → multiplier = 1 - |corr| (e.g., 0.8 → 0.2)
   *   - |corr| ≥ 0.9 → multiplier = 0.3 (aggressive reduction)
   *   - |corr| > 0.95 → multiplier = 0 (block) — callers should handle separately
   *
   * Returns the minimum multiplier across all relevant positions.
   */
  getCorrelationMultiplier(
    targetAsset: string,
    targetDirection: string,
    openPositions: OpenPosition[],
    windowSize: number = 60
  ): number {
    const normalizedTarget = targetAsset.toUpperCase();
    const normalizedDir = targetDirection.toUpperCase();

    let multiplier = 1.0;

    for (const pos of openPositions) {
      const posAsset = pos.asset.toUpperCase();
      const posDir = pos.direction.toUpperCase();

      // Skip if same asset or opposite direction
      if (posAsset === normalizedTarget) continue;
      if (posDir !== normalizedDir) continue; // opposite direction = partial hedge

      const corr = this.getPairCorrelation(normalizedTarget, posAsset, windowSize);
      if (corr === null) continue;

      const absCorr = Math.abs(corr);
      let localMultiplier = 1.0;

      if (absCorr >= 0.95) {
        // Near-perfect correlation in same direction — severe risk stacking
        localMultiplier = 0.0;
      } else if (absCorr >= 0.9) {
        localMultiplier = 0.3;
      } else if (absCorr >= 0.7) {
        localMultiplier = 1.0 - absCorr; // 0.7→0.3, 0.8→0.2, 0.89→0.11
      }
      // else absCorr < 0.7 → no reduction

      multiplier = Math.min(multiplier, localMultiplier);
    }

    return multiplier;
  }

  /**
   * Check if a trade should be blocked due to extreme correlation with existing positions.
   */
  shouldBlockForCorrelation(
    targetAsset: string,
    targetDirection: string,
    openPositions: OpenPosition[],
    windowSize: number = 60
  ): { blocked: boolean; reason?: string } {
    const normalizedTarget = targetAsset.toUpperCase();
    const normalizedDir = targetDirection.toUpperCase();

    for (const pos of openPositions) {
      const posAsset = pos.asset.toUpperCase();
      const posDir = pos.direction.toUpperCase();

      if (posAsset === normalizedTarget) continue;
      if (posDir !== normalizedDir) continue;

      const corr = this.getPairCorrelation(normalizedTarget, posAsset, windowSize);
      if (corr === null) continue;

      if (Math.abs(corr) > 0.95) {
        return {
          blocked: true,
          reason: `High cross-asset correlation with existing ${pos.asset} position (|corr|=${Math.abs(corr).toFixed(2)}). Same direction (${posDir}) would amplify identical exposure.`,
        };
      }
    }

    return { blocked: false };
  }

  /**
   * Clear all stored return data (useful for testing or reset).
   */
  clear(): void {
    this.returnsBuffer.clear();
  }

  /**
   * Get debug stats about the buffer.
   */
  getStats(): { asset: string; sampleCount: number }[] {
    const stats: { asset: string; sampleCount: number }[] = [];
    for (const [asset, buffer] of this.returnsBuffer.entries()) {
      stats.push({ asset, sampleCount: buffer.length });
    }
    return stats;
  }
}

export const crossAssetCorrelationService = new CrossAssetCorrelationService();

