import React from "react";
import { TradingSignal } from "../types";

interface SignalCardProps {
  signal: TradingSignal;
  onSend: (signal: TradingSignal) => void;
  sending: boolean;
  userRiskCap: number;
  isSystemLocked: boolean;
}

const SignalCard: React.FC<SignalCardProps> = ({ signal, onSend, sending, userRiskCap, isSystemLocked }) => {
  const isLong = signal.direction === "LONG";
  const colorClass = isLong ? "emerald" : "rose";
  const borderColor = isLong ? "border-emerald-500/30" : "border-rose-500/30";
  const bgGlow = isLong ? "bg-emerald-500/5" : "bg-rose-500/5";
  const shadowGlow = isLong ? "shadow-[0_0_20px_rgba(16,185,129,0.15)]" : "shadow-[0_0_20px_rgba(244,63,94,0.15)]";

  const isBlocked = isSystemLocked || signal.qualityScore < 50; // Simple example check

  return (
    <div className={`rounded-3xl p-6 border ${borderColor} bg-zinc-950/60 backdrop-blur-xl ${shadowGlow} relative overflow-hidden group transition-all hover:scale-[1.02] ${isBlocked ? 'opacity-50 grayscale' : ''}`}>
      {/* Background Glow */}
      <div className={`absolute top-0 right-0 w-32 h-32 rounded-full blur-[60px] pointer-events-none ${bgGlow} opacity-50`}></div>

      <div className="flex justify-between items-center mb-6 relative z-10">
        <div className="flex items-center gap-3">
          <div className={`w-2 h-8 rounded-full ${isLong ? 'bg-emerald-500 shadow-[0_0_10px_#10b981]' : 'bg-rose-500 shadow-[0_0_10px_#f43f5e]'}`}></div>
          <h4 className="text-2xl font-black text-white uppercase tracking-tighter">{signal.asset}</h4>
        </div>
        <div className="flex flex-col items-end">
          <span className={`px-3 py-1 rounded-lg text-xs font-black uppercase tracking-widest border ${isLong ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-rose-500/10 text-rose-400 border-rose-500/20"}`}>
            {signal.direction}
          </span>
          <span className="text-[10px] font-mono text-zinc-500 mt-1">{signal.strategy.replace('_', ' / ')} | Score: {signal.qualityScore}%</span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6 relative z-10">
        <div className="bg-zinc-900/50 rounded-2xl p-3 border border-zinc-800/50">
          <div className="text-[9px] font-black text-zinc-500 uppercase tracking-widest mb-1">Entry</div>
          <div className="text-sm font-mono font-bold text-white">{signal.entry}</div>
        </div>
        <div className="bg-zinc-900/50 rounded-2xl p-3 border border-zinc-800/50">
          <div className="text-[9px] font-black text-zinc-500 uppercase tracking-widest mb-1">Stop Loss</div>
          <div className="text-sm font-mono font-bold text-rose-400">{signal.stopLoss}</div>
        </div>
        <div className="bg-zinc-900/50 rounded-2xl p-3 border border-zinc-800/50">
          <div className="text-[9px] font-black text-zinc-500 uppercase tracking-widest mb-1">Take Profit</div>
          <div className="text-sm font-mono font-bold text-emerald-400">{signal.takeProfit}</div>
        </div>
      </div>

      <div className="mb-6 relative z-10">
        <p className="text-xs text-zinc-400 leading-relaxed italic border-l-2 border-zinc-800 pl-3">
          "{signal.reasoning}"
        </p>
      </div>

      <button
        onClick={() => onSend(signal)}
        disabled={isBlocked || sending}
        className={`w-full relative z-10 py-4 rounded-2xl text-xs font-black uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-3 border ${isLong ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400 hover:bg-emerald-500 hover:text-black' : 'bg-rose-500/10 border-rose-500/20 text-rose-400 hover:bg-rose-500 hover:text-white'} ${isBlocked ? 'cursor-not-allowed' : ''}`}
      >
        {sending ? 'Executing...' : isBlocked ? 'Blocked' : 'Execute Signal'}
      </button>
    </div>
  );
};

export default React.memo(SignalCard);
