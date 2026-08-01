/**
 * ARKON v50.0.0 — Custom Hook: حساب أداء الاستراتيجيات
 * استخراج منطق calculatePerformance من App.tsx
 */
import { useMemo } from "react";
import { calculatePerformance } from "../services/performanceService";

export function usePerformanceMetrics(tradeHistory: any[]) {
  const performanceMetrics = useMemo(
    () => calculatePerformance(tradeHistory),
    [tradeHistory],
  );

  return performanceMetrics;
}

