import React, { useMemo } from 'react';
import { TradingSignal, SignalDirection } from '../types';

interface TradePipelineProps {
  signals: TradingSignal[];
  managedTrades: any[];
  tradeHistory: any[];
}

export const TradePipeline: React.FC<TradePipelineProps> = ({ signals, managedTrades, tradeHistory }) => {
  const pendingSignals = useMemo(() => signals.slice(0, 10), [signals]); // Top 10 recent
  const activeTrades = useMemo(() => managedTrades || [], [managedTrades]);
  const closedTrades = useMemo(() => tradeHistory.slice(-50).reverse() || [], [tradeHistory]); // Top 50 closed
  
  const getPnlColor = (pnl: number) => {
    if (pnl > 0) return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
    if (pnl < 0) return 'text-rose-400 bg-rose-500/10 border-rose-500/20';
    return 'text-zinc-400 bg-zinc-500/10 border-zinc-500/20';
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      <div className="flex justify-between items-center mb-8 border-b border-zinc-900/50 pb-8">
        <h2 className="text-3xl font-black text-white italic uppercase tracking-tighter">
          مسار الصفقات <span className="text-amber-500">(Pipeline)</span>
        </h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-start">
        {/* Column 1: Signals */}
        <div className="glass-card rounded-[3rem] p-6 border border-zinc-800 bg-zinc-900/40 relative">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-10 h-10 rounded-full bg-indigo-500/20 flex items-center justify-center text-indigo-400 border border-indigo-500/30">
              <i className="fas fa-satellite-dish"></i>
            </div>
            <h3 className="text-lg font-black text-white">إشارات قيد المعالجة</h3>
            <span className="ml-auto bg-indigo-500/20 text-indigo-400 text-xs px-3 py-1 rounded-full font-bold">{pendingSignals.length}</span>
          </div>
          <div className="space-y-4 max-h-[60vh] overflow-y-auto custom-scrollbar pr-2">
            {pendingSignals.length === 0 ? (
              <div className="text-center text-zinc-600 italic py-10 text-xs">لا يوجد إشارات حالية</div>
            ) : (
              pendingSignals.map(sig => (
                <div key={sig.id} className="p-4 rounded-2xl bg-zinc-950/50 border border-zinc-800/80 hover:border-indigo-500/50 transition-all flex flex-col gap-3">
                  <div className="flex justify-between items-center">
                    <span className="text-white font-bold text-sm tracking-wider">{sig.asset}</span>
                    <span className={`text-[10px] px-2 py-1 rounded-md font-bold uppercase ${sig.direction === SignalDirection.LONG ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}`}>
                      {sig.direction}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-[10px] text-zinc-500 font-mono">
                    <span>{new Date(sig.timestamp).toLocaleTimeString()}</span>
                    <span className="text-amber-500/80">Score: {sig.qualityScore}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Column 2: Active Trades */}
        <div className="glass-card rounded-[3rem] p-6 border border-amber-500/20 bg-amber-500/5 relative shadow-[0_0_30px_rgba(245,158,11,0.05)]">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center text-amber-400 border border-amber-500/30">
              <i className="fas fa-bolt"></i>
            </div>
            <h3 className="text-lg font-black text-amber-400">الصفقات النشطة</h3>
            <span className="ml-auto bg-amber-500/20 text-amber-500 text-xs px-3 py-1 rounded-full font-bold">{activeTrades.length}</span>
          </div>
          <div className="space-y-4 max-h-[60vh] overflow-y-auto custom-scrollbar pr-2">
            {activeTrades.length === 0 ? (
              <div className="text-center text-zinc-600 italic py-10 text-xs">لا توجد صفقات مفتوحة</div>
            ) : (
              activeTrades.map(trade => (
                <div key={trade.ticket || Math.random()} className="p-4 rounded-2xl bg-zinc-950/80 border border-amber-500/20 hover:border-amber-500/60 transition-all flex flex-col gap-3 group">
                  <div className="flex justify-between items-center">
                    <span className="text-white font-bold text-sm">{trade.asset?.replace('USD', '') || 'UNKNOWN'}</span>
                    <span className={`text-[10px] px-2 py-1 rounded-md font-bold uppercase ${trade.direction === SignalDirection.LONG || trade.type?.toLowerCase().includes('buy') ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {trade.direction || (trade.type?.toLowerCase().includes('buy') ? 'LONG' : 'SHORT')}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[10px] font-mono mt-1">
                    <div className="bg-zinc-900/50 p-2 rounded-lg border border-zinc-800">
                      <div className="text-zinc-600 mb-1">Entry</div>
                      <div className="text-zinc-300">{trade.entryPrice || trade.price || '0.00'}</div>
                    </div>
                    <div className={`p-2 rounded-lg border ${getPnlColor(trade.pnl || 0)}`}>
                      <div className="opacity-70 mb-1">PnL</div>
                      <div className="font-bold">${(trade.pnl || 0).toFixed(2)}</div>
                    </div>
                  </div>
                  {/* Magic progress bar reflecting volume or time could go here */}
                  <div className="text-right text-[9px] text-zinc-600 mt-1 uppercase">Ticket: {trade.ticket}</div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Column 3: Closed Trades */}
        <div className="glass-card rounded-[3rem] p-6 border border-zinc-800 bg-zinc-900/40 relative">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-400 border border-zinc-700">
              <i className="fas fa-history"></i>
            </div>
            <h3 className="text-lg font-black text-white">السجل المغلق</h3>
            <span className="ml-auto bg-zinc-800 text-zinc-400 text-xs px-3 py-1 rounded-full font-bold">{closedTrades.length}</span>
          </div>
          <div className="space-y-4 max-h-[60vh] overflow-y-auto custom-scrollbar pr-2">
            {closedTrades.length === 0 ? (
              <div className="text-center text-zinc-600 italic py-10 text-xs">سجل الصفقات فارغ</div>
            ) : (
              closedTrades.map(trade => (
                <div key={trade.id || Math.random()} className="p-4 rounded-2xl bg-zinc-950/50 border border-zinc-800 hover:border-zinc-700 transition-all flex flex-col gap-2">
                  <div className="flex w-full justify-between items-center">
                    <div className="flex items-center gap-2">
                      <span className="text-white font-bold text-sm">{trade.asset?.replace('USD', '')}</span>
                      <span className={`text-[9px] uppercase font-bold tracking-wider ${trade.direction === 'LONG' || trade.type?.toLowerCase().includes('buy') ? 'text-emerald-500' : 'text-rose-500'}`}>
                        {trade.direction || (trade.type?.toLowerCase().includes('buy') ? 'LONG' : 'SHORT')}
                      </span>
                    </div>
                    <div className={`text-xs font-black font-mono ${trade.pnlPoints > 0 || trade.profit > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {trade.pnlPoints > 0 || trade.profit > 0 ? '+' : ''}
                      {((trade.pnlPoints ?? trade.profit) || 0).toFixed(2)}
                    </div>
                  </div>
                  <div className="flex justify-between items-center text-[9px] text-zinc-500 font-mono">
                      <span>{trade.strategy || 'MANUAL'}</span>
                      <span>{new Date(trade.closeTime || trade.timestamp || Date.now()).toLocaleDateString()}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

      </div>
    </div>
  );
};
