/**
 * ARKON v50.0.0 — Custom Hook: نظام التسجيل (Logging System)
 * استخراج منطق addLog من App.tsx لتقليل الحجم وتحسين الصيانة
 */
import { useCallback, useState } from "react";
import { logStructured } from "../utils/logger";
import type { LogEntry, LogType } from "../types";
import { MAX_LOG_ENTRIES } from "../utils/constants";

export function useLogger() {
  const [logs, setLogs] = useState<LogEntry[]>([
    {
      id: "start",
      timestamp: Date.now(),
      type: "SYSTEM",
      message: `ARKON v50.00-LOCAL [TURBO MODE] ACTIVE.`,
    },
  ]);

  const addLog = useCallback(
    (
      message: string,
      type: LogType = "INFO",
      details?: string | object,
    ) => {
      let category: "QUANT" | "RISK" | "EXEC" | "COMPLIANCE" | "SYSTEM" =
        "SYSTEM";
      let level: "INFO" | "WARN" | "ERROR" = "INFO";

      if (
        type === "RISK" ||
        type === "COOLDOWN" ||
        type === "HEDGE"
      ) {
        category = "RISK";
        level = "WARN";
      } else if (type === "EXEC") {
        category = "EXEC";
        level = "INFO";
      } else if (type === "ERROR") {
        category = "SYSTEM";
        level = "ERROR";
      } else if (type === "QUANT") {
        category = "QUANT";
        level = "INFO";
      } else if (
        type === "SYSTEM" ||
        type === "STRATEGY_SWITCH"
      ) {
        category = "SYSTEM";
        level = "WARN";
      }

      logStructured(category, level, `ui_${type.toLowerCase()}`, message, {
        details,
      });

      setLogs((prev) =>
        [
          {
            id: Math.random().toString(36).substr(2, 9),
            timestamp: Date.now(),
            type,
            message,
            details,
          },
          ...prev,
        ].slice(0, MAX_LOG_ENTRIES),
      );
    },
    [],
  );

  return { logs, addLog };
}

