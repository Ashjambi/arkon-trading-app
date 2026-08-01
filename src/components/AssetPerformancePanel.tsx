import React from "react";
import { useAssetPerformance } from "../hooks/useAssetPerformance";

export const AssetPerformancePanel: React.FC = () => {
  const { snapshot, disabledStrategies, refresh } = useAssetPerformance();

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-bold text-white">Asset Performance Monitor</h3>
        <button
          onClick={refresh}
          className="text-[10px] font-black uppercase tracking-widest bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-4 py-2 rounded-xl transition-all"
        >
          ↻ Refresh
        </button>
      </div>

      {/* Disabled Strategies Alert */}
      {disabledStrategies.length > 0 && (
        <div className="bg-rose-500/10 border border-rose-500/30 rounded-2xl p-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
            <span className="text-rose-400 font-black text-xs uppercase tracking-widest">
              {disabledStrategies.length} استراتيجية معطلة تلقائياً
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {disabledStrategies.map((entry) => (
              <div
                key={`disabled-${entry.asset}-${entry.strategy}`}
                className="bg-zinc-950 border border-rose-500/20 rounded-xl p-3"
              >
                <div className="flex justify-between items-center">
                  <span className="text-white font-bold text-xs">
                    {entry.asset}/{entry.strategy}
                  </span>
                  <span className="text-[10px] text-rose-400 font-black uppercase">
                    ⛔ Disabled
                  </span>
                </div>
                {entry.stats && (
                  <div className="mt-2 grid grid-cols-3 gap-2 text-[10px] text-zinc-400">
                    <span>WR: {(entry.stats.winRate * 100).toFixed(1)}%</span>
                    <span>Trades: {entry.stats.totalTrades}</span>
                    <span>PnL: ${entry.stats.totalPnl.toFixed(2)}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Full Performance Snapshot */}
      {snapshot.length === 0 ? (
        <div className="text-zinc-500 text-sm text-center py-8 italic">
          No trade data recorded yet. Trades will appear here after execution.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {snapshot.map((entry) => {
            const isDisabled = disabledStrategies.some(
              (d) => d.asset === entry.asset && d.strategy === entry.strategy,
            );
            return (
              <div
                key={`perf-${entry.asset}-${entry.strategy}`}
                className={`rounded-2xl border p-5 transition-all ${
                  isDisabled
                    ? "bg-rose-950/20 border-rose-500/20 opacity-70"
                    : "bg-zinc-900/50 border-zinc-800 hover:border-zinc-700"
                }`}
              >
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <div className="text-sm font-black text-white">
                      {entry.strategy}
                    </div>
                    <div className="text-[10px] text-zinc-500 font-mono uppercase tracking-wider">
                      {entry.asset}
                    </div>
                  </div>
                  <div
                    className={`text-[10px] font-black uppercase px-3 py-1 rounded-full ${
                      isDisabled
                        ? "bg-rose-500/20 text-rose-400"
                        : "bg-emerald-500/20 text-emerald-400"
                    }`}
                  >
                    {isDisabled ? "DISABLED" : "ACTIVE"}
                  </div>
                </div>

                {entry.stats && (
                  <div className="space-y-3">
                    {/* Win Rate Bar */}
                    <div>
                      <div className="flex justify-between text-[10px] text-zinc-400 mb-1">
                        <span>Win Rate</span>
                        <span className="font-bold text-white">
                          {(entry.stats.winRate * 100).toFixed(1)}%
                        </span>
                      </div>
                      <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            entry.stats.winRate >= 0.5
                              ? "bg-emerald-500"
                              : entry.stats.winRate >= 0.3
                                ? "bg-amber-500"
                                : "bg-rose-500"
                          }`}
                          style={{ width: `${Math.min(100, entry.stats.winRate * 100)}%` }}
                        />
                      </div>
                    </div>

                    {/* Stats Grid */}
                    <div className="grid grid-cols-2 gap-2 text-[10px]">
                      <div className="bg-zinc-950/60 rounded-lg p-2">
                        <span className="text-zinc-500">Trades</span>
                        <div className="text-white font-bold">{entry.stats.totalTrades}</div>
                      </div>
                      <div className="bg-zinc-950/60 rounded-lg p-2">
                        <span className="text-zinc-500">Profit Factor</span>
                        <div className="text-white font-bold">{entry.stats.profitFactor.toFixed(2)}</div>
                      </div>
                      <div className="bg-zinc-950/60 rounded-lg p-2">
                        <span className="text-zinc-500">Total PnL</span>
                        <div className={`font-bold ${entry.stats.totalPnl >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                          ${entry.stats.totalPnl.toFixed(2)}
                        </div>
                      </div>
                      <div className="bg-zinc-950/60 rounded-lg p-2">
                        <span className="text-zinc-500">Consecutive Losses</span>
                        <div className={`font-bold ${entry.stats.consecutiveLosses >= 3 ? "text-rose-400" : "text-white"}`}>
                          {entry.stats.consecutiveLosses}
                        </div>
                      </div>
                    </div>

                    {/* Last Trade Time */}
                    <div className="text-[9px] text-zinc-600 font-mono text-right">
                      Last: {new Date(entry.stats.lastTradeTimestamp).toLocaleTimeString()}
                    </div>
                  </div>
                )}

                {!entry.stats && (
                  <div className="text-zinc-500 text-[11px] italic">No data yet</div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Summary Stats */}
      {snapshot.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-zinc-900/40 rounded-xl p-4 border border-zinc-800 text-center">
            <div className="text-2xl font-black text-white">{snapshot.length}</div>
            <div className="text-[10px] text-zinc-500 uppercase tracking-widest">Tracked Strategies</div>
          </div>
          <div className="bg-zinc-900/40 rounded-xl p-4 border border-zinc-800 text-center">
            <div className="text-2xl font-black text-emerald-400">
              {snapshot.filter((e) => e.stats && e.stats.winRate >= 0.5).length}
            </div>
            <div className="text-[10px] text-zinc-500 uppercase tracking-widest">Above 50% WR</div>
          </div>
          <div className="bg-zinc-900/40 rounded-xl p-4 border border-zinc-800 text-center">
            <div className="text-2xl font-black text-rose-400">{disabledStrategies.length}</div>
            <div className="text-[10px] text-zinc-500 uppercase tracking-widest">Auto-Disabled</div>
          </div>
          <div className="bg-zinc-900/40 rounded-xl p-4 border border-zinc-800 text-center">
            <div className="text-2xl font-black text-amber-400">
              {snapshot.reduce((sum, e) => sum + (e.stats?.consecutiveLosses || 0), 0)}
            </div>
            <div className="text-[10px] text-zinc-500 uppercase tracking-widest">Total Consecutive Losses</div>
          </div>
        </div>
      )}
    </div>
  );
};

