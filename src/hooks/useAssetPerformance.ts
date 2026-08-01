/**
 * ARKON v50.0.0 — Custom Hook: مراقبة أداء الاستراتيجيات
 * يغلّف AssetPerformanceMonitor لتوفير بيانات الأداء لمكوّنات الواجهة
 */
import { useState, useCallback, useEffect, useRef } from "react";
import {
  assetPerformanceMonitor,
  StrategyStats,
} from "../services/AssetPerformanceMonitor";

export interface AssetPerformanceEntry {
  asset: string;
  strategy: string;
  stats: StrategyStats | null;
}

export function useAssetPerformance() {
  const [snapshot, setSnapshot] = useState<AssetPerformanceEntry[]>([]);
  const [disabledStrategies, setDisabledStrategies] = useState<
    AssetPerformanceEntry[]
  >([]);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(() => {
    const snap = assetPerformanceMonitor.getSnapshot();
    setSnapshot(
      snap.map((s) => ({
        asset: s.asset,
        strategy: s.strategy,
        stats: s.stats,
      })),
    );

    const disabled = assetPerformanceMonitor.getDisabledStrategies();
    setDisabledStrategies(
      disabled.map((s) => ({
        asset: s.asset,
        strategy: s.strategy,
        stats: s.stats,
      })),
    );
  }, []);

  // Auto-refresh every 10 seconds
  useEffect(() => {
    refresh();
    intervalRef.current = setInterval(refresh, 10000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [refresh]);

  const isStrategyDisabled = useCallback(
    (asset: string, strategy: string): boolean => {
      return assetPerformanceMonitor.isDisabled(asset, strategy);
    },
    [],
  );

  const getStats = useCallback(
    (asset: string, strategy: string): StrategyStats | null => {
      return assetPerformanceMonitor.getStats(asset, strategy);
    },
    [],
  );

  return {
    snapshot,
    disabledStrategies,
    refresh,
    isStrategyDisabled,
    getStats,
  };
}

