/**
 * ARKON v50.0.0 — Custom Hook: إعادة توازن المحفظة متعددة الأصول
 * استخراج منطق rebalance من App.tsx
 */
import { useState, useCallback, type MutableRefObject } from "react";
import { MultiAssetManager, RebalanceOrder } from "../services/MultiAssetManager";
import { MT5_SYMBOL_ALIASES, GOLD_MAX_PRICE_AGE_MS } from "../utils/constants";

export function useRebalance(
  addLog: (msg: string, type?: unknown, details?: unknown) => void,
  btcDataRef: MutableRefObject<{ summary?: unknown; ticker?: unknown; book?: unknown }>,
  ethDataRef: MutableRefObject<{ summary?: unknown; ticker?: unknown; book?: unknown }>,
  managedTradesRef: MutableRefObject<unknown[]>,
  crlStateRef: MutableRefObject<unknown>,
) {
  const [rebalanceOrders, setRebalanceOrders] = useState<RebalanceOrder[]>([]);
  const [isRebalancing, setIsRebalancing] = useState(false);

  const extractMt5Quote = useCallback(
    (
      state: unknown,
      symbolAliases: string[],
    ): { price: number; timestampMs: number } | null => {
      if (!state || typeof state !== "object") return null;
      const aliases = symbolAliases.map((s) =>
        String(s || "").toUpperCase(),
      );
      const containers = [
        (state as any).marketQuotes,
        (state as any).quotes,
        (state as any).symbolPrices,
        (state as any).prices,
        (state as any).marketData,
        (state as any).ticks,
      ];

      const resolvePrice = (q: unknown): number => {
        const qq = q as any;
        const last = Number(qq?.last ?? qq?.price ?? qq?.close ?? 0);
        if (Number.isFinite(last) && last > 0) return last;
        const bid = Number(qq?.bid ?? 0);
        const ask = Number(qq?.ask ?? 0);
        if (
          Number.isFinite(bid) &&
          Number.isFinite(ask) &&
          bid > 0 &&
          ask > 0
        ) {
          return (bid + ask) / 2;
        }
        return 0;
      };

      const parseQuoteTimestampMs = (raw: unknown): number | null => {
        const r = raw as any;
        if (r === undefined || r === null) return null;
        if (typeof r === "number" && Number.isFinite(r)) {
          return r > 1e12 ? r : r * 1000;
        }
        if (typeof r === "string") {
          const numeric = Number(r);
          if (Number.isFinite(numeric)) {
            return numeric > 1e12 ? numeric : numeric * 1000;
          }
          const parsed = Date.parse(r);
          return Number.isNaN(parsed) ? null : parsed;
        }
        return null;
      };

      for (const container of containers) {
        if (!container) continue;

        if (Array.isArray(container)) {
          for (const item of container) {
            const symbol = String(
              item?.symbol ?? item?.asset ?? item?.instrument ?? "",
            ).toUpperCase();
            if (!aliases.includes(symbol)) continue;
            const price = resolvePrice(item);
            if (!Number.isFinite(price) || price <= 0) continue;
            const timestampMs =
              parseQuoteTimestampMs(
                item?.timestamp ??
                  item?.ts ??
                  item?.time ??
                  item?.updatedAt,
              ) ?? Date.now();
            return { price, timestampMs };
          }
          continue;
        }

        if (typeof container === "object") {
          for (const alias of aliases) {
            const q = (container as any)[alias] || (container as any)[alias.toLowerCase()];
            if (!q) continue;
            const price = resolvePrice(q);
            if (!Number.isFinite(price) || price <= 0) continue;
            const timestampMs =
              parseQuoteTimestampMs(
                q?.timestamp ?? q?.ts ?? q?.time ?? q?.updatedAt,
              ) ?? Date.now();
            return { price, timestampMs };
          }
        }
      }

      return null;
    },
    [],
  );

  const handlePreviewRebalance = useCallback(async () => {
    setIsRebalancing(true);
    try {
      const mt5GoldQuote = extractMt5Quote(crlStateRef.current, [
        "XAUUSD",
        "XAUUSDM",
        "XAUUSD.M",
        "GOLD",
      ]);
      const goldQuoteAgeMs = mt5GoldQuote
        ? Math.max(0, Date.now() - mt5GoldQuote.timestampMs)
        : Number.POSITIVE_INFINITY;
      const hasFreshGoldQuote =
        mt5GoldQuote !== null && goldQuoteAgeMs <= GOLD_MAX_PRICE_AGE_MS;

      if (!hasFreshGoldQuote) {
        addLog(
          "⚠️ GOLD price from MT5 is missing/stale. Preview uses fallback 2400 only for estimation.",
          "RISK",
          {
            goldQuoteAgeMs: Number.isFinite(goldQuoteAgeMs)
              ? Math.round(goldQuoteAgeMs)
              : null,
            maxAgeMs: GOLD_MAX_PRICE_AGE_MS,
          },
        );
      }

      const manager = new MultiAssetManager(
        async () => {
          const btcPx = Number(
            (btcDataRef.current?.ticker as any)?.last ||
              (btcDataRef.current?.summary as any)?.last ||
              (btcDataRef.current?.summary as any)?.last_price ||
              0,
          );
          const ethPx = Number(
            (ethDataRef.current?.ticker as any)?.last ||
              (ethDataRef.current?.summary as any)?.last ||
              (ethDataRef.current?.summary as any)?.last_price ||
              0,
          );
          return {
            BTCUSD: btcPx > 0 ? btcPx : 50000,
            ETHUSD: ethPx > 0 ? ethPx : 2500,
            SOLUSD: 100,
            XRPUSD: 0.5,
            GOLD: hasFreshGoldQuote ? Number(mt5GoldQuote!.price) : 2400,
            USDT: 1,
          };
        },
        async () => {
          const buckets = new Map<string, number>([
            ["BTCUSD", 0],
            ["ETHUSD", 0],
            ["SOLUSD", 0],
            ["XRPUSD", 0],
            ["GOLD", 0],
            ["USDT", 0],
          ]);

          const equity =
            crlStateRef.current &&
            typeof (crlStateRef.current as any).equity === "number" &&
            (crlStateRef.current as any).equity > 0
              ? Number((crlStateRef.current as any).equity)
              : crlStateRef.current &&
                  typeof (crlStateRef.current as any).baseline === "number" &&
                  (crlStateRef.current as any).baseline > 0
                ? Number((crlStateRef.current as any).baseline)
                : 3000;

          let used = 0;
          for (const t of managedTradesRef.current as any[]) {
            const symbolRaw = String(
              t.asset || t.symbol || "",
            ).toUpperCase();
            let mapped = "USDT";
            if (symbolRaw.includes("BTC")) mapped = "BTCUSD";
            else if (symbolRaw.includes("ETH")) mapped = "ETHUSD";
            else if (symbolRaw.includes("SOL")) mapped = "SOLUSD";
            else if (symbolRaw.includes("XRP")) mapped = "XRPUSD";
            else if (
              symbolRaw.includes("XAU") ||
              symbolRaw.includes("GOLD")
            )
              mapped = "GOLD";

            const size = Number(
              t.size ||
                t.volume ||
                t.lotSize ||
                t.initialVolume ||
                0,
            );
            const entry = Number(
              t.entryPrice || t.openPrice || 0,
            );
            const notional = Math.max(0, size * entry);
            buckets.set(
              mapped,
              (buckets.get(mapped) || 0) + notional,
            );
            used += notional;
          }

          buckets.set("USDT", Math.max(0, equity - used));

          return Array.from(buckets.entries()).map(
            ([symbol, valueUSD]) => ({ symbol, valueUSD }),
          );
        },
        {
          minRebalanceDiffPct: 0.01,
          minOrderNotionalUSD: 25,
        },
      );

      const orders = await manager.rebalancePortfolio();
      setRebalanceOrders(orders);
      addLog(
        `📊 Multi-Asset rebalance preview generated: ${orders.length} orders`,
        "SYSTEM",
      );
    } catch (e: unknown) {
      const errMsg = typeof e === "object" && e && "message" in e ? (e as any).message : String(e);
      addLog(`❌ Rebalance preview failed: ${errMsg}`, "ERROR");
      setRebalanceOrders([]);
    } finally {
      setIsRebalancing(false);
    }
  }, [
    addLog,
    btcDataRef,
    ethDataRef,
    managedTradesRef,
    crlStateRef,
    extractMt5Quote,
  ]);

  return {
    rebalanceOrders,
    isRebalancing,
    handlePreviewRebalance,
    setRebalanceOrders,
  };
}

