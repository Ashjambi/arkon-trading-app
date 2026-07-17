import React from "react";
import { MarketAnalysisState, AppConfig } from "../types";
import { gateRegistry } from "../services/gates/GateRegistry";

interface MarketStatsProps {
  state: MarketAnalysisState | null;
  title: string;
  config: AppConfig;
}

const MarketStats: React.FC<MarketStatsProps> = ({ state, title, config }) => {
  console.log(`🔍 [MarketStats] ${title} state:`, state);
  if (state) {
      console.log(`🔍 [MarketStats] ${title} qualityScore:`, state.qualityScore);
  }
  if (!state)
    return (
      <div className="rounded-[2rem] p-10 h-[600px] border border-white/5 bg-zinc-950/40 backdrop-blur-2xl flex flex-col justify-center items-center text-center gap-6 relative overflow-hidden shadow-[0_8px_32px_0_rgba(0,0,0,0.5)]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(255,255,255,0.02),transparent_60%)]"></div>
        <div className="w-16 h-16 rounded-full border-2 border-zinc-800 border-t-indigo-500 animate-spin flex items-center justify-center relative z-10 shadow-[0_0_15px_rgba(99,102,241,0.5)]">
          <div className="w-2 h-2 bg-indigo-500 rounded-full animate-pulse"></div>
        </div>
        <div className="relative z-10">
          <h3 className="text-zinc-400 font-mono text-sm uppercase tracking-[0.2em] mb-2">
            {title}
          </h3>
          <p className="text-[10px] text-zinc-500 font-mono uppercase tracking-widest animate-pulse">
            Connecting to Quant Engine...
          </p>
        </div>
      </div>
    );

  const isUp = state.trendDirection === "UP";
  const newsPaused = state.isNewsPaused;
  const dailyLossPaused = state.isDailyLossPaused;
  const effectiveThreshold = config.hunterMode ? Math.max(0, config.minSignalScore - 20) : config.minSignalScore;
  const isHunterReady = (state.qualityScore >= effectiveThreshold) && !newsPaused && !dailyLossPaused;

  const isActuallyCooling =
    (newsPaused || dailyLossPaused) && state.activeEvent && state.activeEvent.timestamp < Date.now();

  // Determine the primary color theme based on state
  let themeColor = "zinc";
  let glowColor = "rgba(255,255,255,0.03)";
  let decisionText = "ANALYZING";
  let decisionColor = "text-zinc-400";

  if (dailyLossPaused) {
    themeColor = "rose";
    glowColor = "rgba(244,63,94,0.15)";
    decisionText = "DAILY LOSS LIMIT REACHED";
    decisionColor = "text-rose-400";
  } else if (newsPaused) {
    themeColor = isActuallyCooling ? "amber" : "rose";
    glowColor = isActuallyCooling ? "rgba(245,158,11,0.15)" : "rgba(244,63,94,0.15)";
    decisionText = isActuallyCooling ? "COOLING DOWN" : "NEWS BLOCKED";
    decisionColor = isActuallyCooling ? "text-amber-400" : "text-rose-400";
  } else if (isHunterReady) {
    themeColor = isUp ? "emerald" : "rose";
    glowColor = isUp ? "rgba(16,185,129,0.15)" : "rgba(244,63,94,0.15)";
    decisionText = "READY FOR ENTRY";
    decisionColor = isUp ? "text-emerald-400" : "text-rose-400";
  } else {
    themeColor = "indigo";
    glowColor = "rgba(99,102,241,0.08)";
    decisionText = "WAITING FOR GATES";
    decisionColor = "text-indigo-400";
  }

  return (
    <div
      className={`rounded-[2rem] overflow-hidden border flex flex-col h-full min-h-[480px] relative transition-all duration-500 bg-zinc-950/60 backdrop-blur-2xl shadow-[0_8px_32px_0_rgba(0,0,0,0.5)] ${
        dailyLossPaused
          ? "border-rose-500/30"
          : newsPaused
            ? (isActuallyCooling ? "border-amber-500/30" : "border-rose-500/30")
            : isHunterReady
              ? (isUp ? "border-emerald-500/30" : "border-rose-500/30")
              : "border-white/10 hover:border-white/20"
      }`}
      dir="ltr"
    >
      {/* Neon Glow Background Orb */}
      <div 
        className="absolute top-[-20%] left-[-10%] w-[140%] h-[60%] rounded-[100%] blur-[80px] pointer-events-none transition-all duration-1000"
        style={{ background: `radial-gradient(ellipse at center, ${glowColor} 0%, transparent 70%)` }}
      ></div>

      {/* Header Section */}
      <div className="p-6 relative z-10 flex justify-between items-start">
        <div>
          <h3 className="text-2xl font-black text-white tracking-tight font-sans drop-shadow-md">
            {title.split(' ')[0]} <span className="text-white/50 font-light">{title.split(' ').slice(1).join(' ')}</span>
          </h3>
          <div className="flex items-baseline gap-2 mt-1">
            <span className={`text-3xl font-mono font-medium tracking-tight ${!state.price || state.price === 0 ? 'text-rose-500 animate-pulse' : 'text-white'}`}>
              {!state.price || state.price === 0 ? 'NO DATA' : `$${state.price.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 2 })}`}
            </span>
            {state.price !== 0 && (
              <span className={`text-xs font-mono font-bold ${state.vwapDeviation >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {state.vwapDeviation >= 0 ? '+' : ''}{(state.vwapDeviation * 100).toFixed(2)}%
              </span>
            )}
          </div>
        </div>
        
        {/* Decision Badge */}
        <div className={`px-4 py-2 rounded-xl border backdrop-blur-md flex flex-col items-end shadow-lg ${
          newsPaused 
            ? (isActuallyCooling ? "bg-amber-500/10 border-amber-500/30" : "bg-rose-500/10 border-rose-500/30")
            : isHunterReady
              ? (isUp ? "bg-emerald-500/10 border-emerald-500/30" : "bg-rose-500/10 border-rose-500/30")
              : "bg-indigo-500/10 border-indigo-500/30"
        }`}>
          <span className="text-[8px] font-mono text-white/60 uppercase tracking-widest mb-0.5">
            Current Decision
          </span>
          <span className={`text-sm font-black font-mono tracking-wider ${decisionColor} drop-shadow-[0_0_8px_currentColor]`}>
            {decisionText}
          </span>
          {!isHunterReady && (
            <span className="text-[8px] font-mono text-white/40 uppercase tracking-widest mt-1">
              Blocker: {state.primaryBlocker}
            </span>
          )}
        </div>
      </div>

      {/* The Brain / Quality Section */}
      <div className="px-6 pb-6 relative z-10 flex items-center gap-6">
        {/* Circular Progress */}
        <div className="relative w-24 h-24 flex items-center justify-center shrink-0">
          <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="45" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="8" />
            <circle 
              cx="50" cy="50" r="45" fill="none" 
              stroke="currentColor" strokeWidth="8" strokeLinecap="round"
              className={`transition-all duration-1000 ${
                state.qualityScore >= 80 ? "text-emerald-500" : state.qualityScore >= 50 ? "text-amber-500" : "text-rose-500"
              }`}
              style={{ strokeDasharray: 283, strokeDashoffset: 283 - (283 * state.qualityScore) / 100 }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-xl font-black font-mono text-white">{Math.round(state.qualityScore)}%</span>
            <span className="text-[8px] font-mono text-white/50 uppercase tracking-widest text-center mt-1">Algo<br/>Score</span>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="flex-1 grid grid-cols-2 gap-3">
          <div className="bg-white/5 border border-white/10 rounded-xl p-3 backdrop-blur-sm">
            <span className="text-[9px] font-mono text-white/40 uppercase tracking-wider block mb-1">Market Regime</span>
            <span className="text-xs font-mono font-bold text-white truncate block" title={state.regime.replace("_", " ")}>
              {state.regime.replace("_", " ")}
            </span>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-xl p-3 backdrop-blur-sm col-span-2 flex justify-between items-center">
            <span className="text-[9px] font-mono text-white/40 uppercase tracking-wider">Primary Blocker</span>
            <span className="text-xs font-mono font-bold text-white">
              {state.primaryBlocker || 'NONE'}
            </span>
          </div>
        </div>
      </div>

      {/* Institutional Metrics List - Enhanced View */}
      <div className="px-6 pb-6 relative z-10">
        <h4 className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-3">معايير الإستراتيجية (Metrics)</h4>
        <div className="grid grid-cols-2 gap-3">
          {gateRegistry.map((gate, i) => {
            const val = gate.getValue(state);
            const thr = gate.getThreshold(config);
            
            // Determine if the gate is active for the current regime
            const isGateActive = (gateId: string, regime: string): boolean => {
              if (regime === 'MEAN_REVERSION' || regime === 'CHOPPY/NOISE') {
                return ['hurst', 'fisher', 'vwapZScore', 'dvol'].includes(gateId);
              }
              if (regime === 'MOMENTUM_TREND' || regime === 'HIGH_VOLATILITY') {
                return ['hurst', 'rSquared', 'ofi', 'dvol'].includes(gateId);
              }
              if (regime === 'LOW_VOLATILITY') {
                return ['ofi', 'volRatio'].includes(gateId);
              }
              return true; // default to active if unknown
            };
            
            const active = isGateActive(gate.id, state.regime);

            // Calculate ratio to show strength instead of strict pass/fail
            let ratio = (val / (thr || 0.001)) * 100;
            if (gate.invert) {
                ratio = (thr / (val || 0.001)) * 100;
            }
            const cappedRatio = Math.min(100, Math.max(0, ratio));
            const isPassed = ratio >= 99.9; // Handle floating precision
            
            return (
              <div 
                key={gate.id} 
                className={`p-3 rounded-xl border relative overflow-hidden transition-all duration-300 ${
                  !active
                    ? "bg-zinc-950/20 border-zinc-800/40 shadow-[inset_0_1px_1px_rgba(255,255,255,0.02)]"
                    : isPassed 
                      ? "bg-emerald-950/20 border-emerald-500/20 shadow-[inset_0_1px_1px_rgba(16,185,129,0.05)]" 
                      : "bg-rose-950/20 border-rose-500/20 shadow-[inset_0_1px_1px_rgba(244,63,94,0.05)]"
                }`}
              >
                {/* Background strength indicator */}
                {active && (
                  <div 
                    className={`absolute left-0 bottom-0 top-0 transition-all duration-500 ${
                      isPassed ? "bg-emerald-500/10" : "bg-rose-500/10"
                    }`} 
                    style={{ width: `${cappedRatio}%` }} 
                  />
                )}
                <div className="relative z-10">
                    <div className="flex justify-between items-center mb-1">
                        <div 
                          className={`text-[9px] font-black uppercase tracking-widest flex items-center gap-1.5 ${
                            !active
                              ? "text-zinc-500"
                              : isPassed ? "text-emerald-400" : "text-rose-400"
                          }`} 
                          title={gate.desc}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${!active ? "bg-zinc-600" : isPassed ? "bg-emerald-400 animate-pulse" : "bg-rose-500"}`} />
                          {gate.label} {!active && "(غير نشط)"}
                        </div>
                    </div>
                    <div className={`text-xs font-mono font-bold ${!active ? "text-zinc-400" : "text-white"}`}>
                      {val.toFixed(3)} <span className={`${!active ? "text-zinc-600" : "text-white/30"} font-normal`}>/ {thr.toFixed(2)}</span>
                    </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Footer Action Bar */}
      <div
        className={`p-4 text-center font-mono font-bold text-[10px] tracking-[0.2em] uppercase transition-all relative z-10 backdrop-blur-xl ${
          isHunterReady 
            ? "bg-emerald-500/10 text-emerald-400 border-t border-emerald-500/20 shadow-[0_-10px_30px_rgba(16,185,129,0.1)]" 
            : newsPaused 
              ? (isActuallyCooling ? "bg-amber-500/10 text-amber-400 border-t border-amber-500/20 shadow-[0_-10px_30px_rgba(245,158,11,0.1)]" : "bg-rose-500/10 text-rose-400 border-t border-rose-500/20 shadow-[0_-10px_30px_rgba(244,63,94,0.1)]") 
              : "bg-indigo-500/10 text-indigo-400 border-t border-indigo-500/20 shadow-[0_-10px_30px_rgba(99,102,241,0.05)]"
        }`}
      >
        {newsPaused
          ? isActuallyCooling
            ? `COOLDOWN: ${state.activeEvent?.currency} NEWS`
            : `DANGER: ${state.activeEvent?.currency} NEWS DETECTED`
          : isHunterReady
            ? "TARGET ACQUIRED: READY TO EXECUTE"
            : "ANALYZING MARKET MICROSTRUCTURE..."}
      </div>
    </div>
  );
};

export default React.memo(MarketStats);
