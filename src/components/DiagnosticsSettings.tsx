import React, { useEffect, useState } from 'react';
import { executionSanityDiagnosticService } from '../services/ExecutionSanityDiagnosticService';
import { AppConfig, DiagnosticsCountersV2, EventCategory } from '../types';
import { getEffectiveUrl } from '../services/webhookService';
import { strategyRegistryService } from '../services/StrategyRegistryService';
import { MultiAssetManager } from '../services/MultiAssetManager';
import { AssetPerformancePanel } from './AssetPerformancePanel';
import { eventTaxonomyService } from '../services/EventTaxonomyService';

interface DiagnosticsSettingsProps {
  config: AppConfig;
}

// ─── V2 Category Help Text ──────────────────────────────────────────

const CATEGORY_HELP: Record<EventCategory, { label: string; description: string; isOperationalFault: boolean }> = {
  SIGNAL_FILTERED: {
    label: 'Signal Filter',
    description: 'Expected market/strategy decision — ADR exhaustion, regime, score, contradiction, or strategy eligibility. Not a bridge or account failure.',
    isOperationalFault: false,
  },
  RISK_BLOCKED: {
    label: 'Risk Block',
    description: 'Intentional hard protection — drawdown, exposure, margin, leverage, strategy budget, or tail-risk restriction.',
    isOperationalFault: false,
  },
  EXECUTION_FAILED: {
    label: 'Execution Failure',
    description: 'A real submitted execution that failed at the broker/exchange level.',
    isOperationalFault: true,
  },
  BRIDGE_FAILURE: {
    label: 'Bridge Incident',
    description: 'Operational authentication, connectivity, timeout, MT5 transport, or server failure.',
    isOperationalFault: true,
  },
  CIRCUIT_BREAKER_TRANSITION: {
    label: 'Breaker Transition',
    description: 'Circuit breaker state change — CLOSED→OPEN, OPEN→HALF_OPEN, HALF_OPEN→CLOSED.',
    isOperationalFault: false,
  },
  CIRCUIT_BREAKER_SUPPRESSED: {
    label: 'Suppressed Attempt',
    description: 'Execution was prevented because the Circuit Breaker was already open. Not a new Circuit Breaker failure.',
    isOperationalFault: false,
  },
};

// ─── Skeleton Loader ────────────────────────────────────────────────

const SkeletonCard: React.FC<{ lines?: number }> = ({ lines = 2 }) => (
  <div className="animate-pulse bg-zinc-900/50 rounded-2xl border border-zinc-800 p-6 space-y-3">
    <div className="h-4 bg-zinc-800 rounded w-2/3" />
    <div className="h-8 bg-zinc-800 rounded w-1/3" />
    {Array.from({ length: lines - 1 }).map((_, i) => (
      <div key={i} className="h-3 bg-zinc-800 rounded w-1/2" />
    ))}
  </div>
);

const SkeletonLayout: React.FC = () => (
  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
    <SkeletonCard lines={3} />
    <SkeletonCard lines={3} />
    <SkeletonCard lines={3} />
    <SkeletonCard lines={2} />
    <SkeletonCard lines={2} />
    <SkeletonCard lines={2} />
  </div>
);

// ─── Circuit Breaker State Badge ────────────────────────────────────

const BreakerStateBadge: React.FC<{ state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' }> = ({ state }) => {
  const config = {
    CLOSED: { color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30', label: 'Execution path available', icon: 'shield-check' },
    HALF_OPEN: { color: 'bg-amber-500/20 text-amber-400 border-amber-500/30', label: 'Recovering — controlled health check in progress', icon: 'clock' },
    OPEN: { color: 'bg-rose-500/20 text-rose-400 border-rose-500/30', label: 'Execution paused — inspect bridge incidents', icon: 'ban' },
  };
  const c = config[state];
  return (
    <span className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[11px] font-black uppercase tracking-wider border ${c.color}`}>
      <i className={`fas fa-${c.icon} text-[10px]`}></i>
      <span>{state.replace('_', ' ')}</span>
      <span className="text-[9px] font-normal normal-case opacity-70">— {c.label}</span>
    </span>
  );
};

// ─── Helper Text Tooltip ────────────────────────────────────────────

const HelpTooltip: React.FC<{ text: string }> = ({ text }) => (
  <div className="group relative inline-block">
    <i className="fas fa-info-circle text-zinc-600 hover:text-zinc-400 cursor-help text-xs transition-colors"></i>
    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-3 rounded-xl bg-zinc-900 border border-zinc-700 text-[10px] text-zinc-300 leading-relaxed opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 shadow-2xl">
      {text}
    </div>
  </div>
);

// ─── V2 Diagnostics Panel ───────────────────────────────────────────

const V2DiagnosticsPanel: React.FC = () => {
  const [snapshot, setSnapshot] = useState<DiagnosticsCountersV2 | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSnapshot = () => {
    setLoading(true);
    setError(null);
    try {
      const data = eventTaxonomyService.getSnapshot();
      setSnapshot(data);
    } catch (e: any) {
      setError(e?.message || 'Failed to load diagnostics snapshot');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSnapshot();
    const interval = setInterval(fetchSnapshot, 5_000);
    return () => clearInterval(interval);
  }, []);

  // Loading state
  if (loading && !snapshot) {
    return (
      <div className="space-y-4">
        <h3 className="text-lg font-bold text-white">Event Diagnostics (V2)</h3>
        <SkeletonLayout />
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="bg-rose-500/10 border border-rose-500/30 rounded-2xl p-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-white mb-2">Event Diagnostics (V2)</h3>
            <p className="text-sm text-rose-300">{error}</p>
          </div>
          <button onClick={fetchSnapshot} className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl text-xs font-black uppercase tracking-wider">
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!snapshot) {
    return (
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6">
        <h3 className="text-lg font-bold text-white mb-2">Event Diagnostics (V2)</h3>
        <p className="text-sm text-zinc-500">No diagnostic data available.</p>
        <button onClick={fetchSnapshot} className="mt-4 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl text-xs font-black uppercase tracking-wider">
          Load
        </button>
      </div>
    );
  }

  const isOpen = snapshot.circuitBreakerState === 'OPEN';

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-bold text-white">Event Diagnostics (V2)</h3>
        <button onClick={fetchSnapshot} className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-colors">
          <i className="fas fa-sync-alt mr-2 text-[10px]"></i> Refresh
        </button>
      </div>

      {/* A. Current Protection State */}
      <div className="bg-zinc-900/50 p-6 rounded-2xl border border-zinc-800 space-y-4">
        <h4 className="text-xs font-black text-zinc-500 uppercase tracking-widest">Current Protection State</h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Active Risk Blocks */}
          <div className={`p-4 rounded-xl border ${snapshot.activeRiskBlocks > 0 ? 'bg-amber-500/10 border-amber-500/30' : 'bg-zinc-950/60 border-zinc-800'}`}>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[10px] font-black text-zinc-500 uppercase tracking-wider">Active Risk Blocks Now</span>
              <HelpTooltip text="Number of currently active risk/compliance restrictions. Not a cumulative total. When blocks are cleared, this decreases." />
            </div>
            <div className={`text-3xl font-black ${snapshot.activeRiskBlocks > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
              {snapshot.activeRiskBlocks}
            </div>
            <div className="text-[10px] text-zinc-500 mt-1">
              {snapshot.activeRiskBlocks === 0 ? 'No active restrictions' : `${snapshot.activeRiskBlocks} protection(s) actively blocking`}
            </div>
          </div>

          {/* Circuit Breaker State */}
          <div className={`p-4 rounded-xl border ${isOpen ? 'bg-rose-500/10 border-rose-500/30' : snapshot.circuitBreakerState === 'HALF_OPEN' ? 'bg-amber-500/10 border-amber-500/30' : 'bg-zinc-950/60 border-zinc-800'}`}>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[10px] font-black text-zinc-500 uppercase tracking-wider">Circuit Breaker State</span>
              <HelpTooltip text="Current circuit breaker state. OPEN = execution paused. HALF_OPEN = health check in progress. CLOSED = normal operation." />
            </div>
            <div className="mt-1">
              <BreakerStateBadge state={snapshot.circuitBreakerState} />
            </div>
            {snapshot.circuitBreakerAsset && (
              <div className="text-[10px] text-zinc-500 mt-2">Affected asset: {snapshot.circuitBreakerAsset}</div>
            )}
          </div>

          {/* Consecutive Breaker Failures */}
          <div className={`p-4 rounded-xl border ${snapshot.consecutiveBreakerFailures > 0 ? 'bg-rose-500/10 border-rose-500/30' : 'bg-zinc-950/60 border-zinc-800'}`}>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[10px] font-black text-zinc-500 uppercase tracking-wider">Current Consecutive Failures</span>
              <HelpTooltip text="Number of consecutive unique bridge/execution failures. Resets on successful execution or manual reset. Threshold is typically 3." />
            </div>
            <div className={`text-3xl font-black ${snapshot.consecutiveBreakerFailures > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
              {snapshot.consecutiveBreakerFailures}
            </div>
            <div className="text-[10px] text-zinc-500 mt-1">
              {snapshot.consecutiveBreakerFailures === 0 ? 'No failures' : `${snapshot.consecutiveBreakerFailures} / ${snapshot.breakerFailureThreshold} threshold`}
            </div>
          </div>
        </div>
      </div>

      {/* B. Today's Unique Events */}
      <div className="bg-zinc-900/50 p-6 rounded-2xl border border-zinc-800 space-y-4">
        <h4 className="text-xs font-black text-zinc-500 uppercase tracking-widest">Today's Unique Events</h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Signal Filters Today */}
          <div className="bg-zinc-950/60 border border-zinc-800 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[10px] font-black text-zinc-500 uppercase tracking-wider">Unique Signal Filters Today</span>
              <HelpTooltip text={CATEGORY_HELP.SIGNAL_FILTERED.description} />
            </div>
            <div className="text-3xl font-black text-blue-400">{snapshot.uniqueSignalFiltersToday}</div>
            <div className="text-[10px] text-zinc-500 mt-1">Expected market/strategy decisions</div>
          </div>

          {/* Risk Blocks Today */}
          <div className="bg-zinc-950/60 border border-zinc-800 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[10px] font-black text-zinc-500 uppercase tracking-wider">Unique Risk Blocks Today</span>
              <HelpTooltip text={CATEGORY_HELP.RISK_BLOCKED.description} />
            </div>
            <div className="text-3xl font-black text-amber-400">{snapshot.uniqueRiskBlocksToday}</div>
            <div className="text-[10px] text-zinc-500 mt-1">Intentional hard protections</div>
          </div>

          {/* Bridge Incidents Today */}
          <div className="bg-zinc-950/60 border border-zinc-800 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[10px] font-black text-zinc-500 uppercase tracking-wider">Unique Bridge Incidents Today</span>
              <HelpTooltip text={CATEGORY_HELP.BRIDGE_FAILURE.description} />
            </div>
            <div className={`text-3xl font-black ${snapshot.uniqueBridgeIncidentsToday > 0 ? 'text-rose-400' : 'text-zinc-500'}`}>{snapshot.uniqueBridgeIncidentsToday}</div>
            <div className="text-[10px] text-zinc-500 mt-1">
              {snapshot.uniqueBridgeIncidentsToday === 0 ? 'No operational failures' : 'Operational bridge/transport failures'}
            </div>
          </div>
        </div>
      </div>

      {/* C. Operational Behavior */}
      <div className="bg-zinc-900/50 p-6 rounded-2xl border border-zinc-800 space-y-4">
        <h4 className="text-xs font-black text-zinc-500 uppercase tracking-widest">Operational Behavior</h4>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Retry Count */}
          <div className="bg-zinc-950/60 border border-zinc-800 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[10px] font-black text-zinc-500 uppercase tracking-wider">Bridge Retry Attempts</span>
              <HelpTooltip text="Number of retry attempts for bridge operations. Retries are not counted as unique failures." />
            </div>
            <div className="text-2xl font-black text-cyan-400">{snapshot.breakerRetryCount}</div>
          </div>

          {/* Suppressed Duplicates */}
          <div className="bg-zinc-950/60 border border-zinc-800 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[10px] font-black text-zinc-500 uppercase tracking-wider">Suppressed While Open</span>
              <HelpTooltip text={CATEGORY_HELP.CIRCUIT_BREAKER_SUPPRESSED.description} />
            </div>
            <div className="text-2xl font-black text-zinc-400">{snapshot.breakerSuppressedDuplicateCount}</div>
          </div>

          {/* OPEN Transitions */}
          <div className="bg-zinc-950/60 border border-zinc-800 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[10px] font-black text-zinc-500 uppercase tracking-wider">Breaker OPEN Transitions</span>
              <HelpTooltip text="Number of times the circuit breaker transitioned to OPEN state. Each represents a distinct opening event." />
            </div>
            <div className={`text-2xl font-black ${snapshot.breakerOpenTransitionCount > 0 ? 'text-rose-400' : 'text-zinc-500'}`}>{snapshot.breakerOpenTransitionCount}</div>
          </div>

          {/* Failure Threshold */}
          <div className="bg-zinc-950/60 border border-zinc-800 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[10px] font-black text-zinc-500 uppercase tracking-wider">Failure Threshold</span>
              <HelpTooltip text="Configured threshold for consecutive failures before circuit breaker opens." />
            </div>
            <div className="text-2xl font-black text-white">{snapshot.breakerFailureThreshold}</div>
          </div>
        </div>

        {/* Category Explanation Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4">
          {(['SIGNAL_FILTERED', 'RISK_BLOCKED', 'BRIDGE_FAILURE'] as EventCategory[]).map((cat) => {
            const help = CATEGORY_HELP[cat];
            return (
              <div key={cat} className={`p-3 rounded-xl border text-[10px] ${help.isOperationalFault ? 'bg-rose-500/5 border-rose-500/20' : 'bg-zinc-950/40 border-zinc-800'}`}>
                <span className={`font-black uppercase tracking-wider ${help.isOperationalFault ? 'text-rose-400' : 'text-zinc-400'}`}>{help.label}</span>
                <p className="text-zinc-500 mt-1 leading-relaxed">{help.description}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* D. Recent Diagnostics Events */}
      <div className="bg-zinc-900/50 p-6 rounded-2xl border border-zinc-800 space-y-4">
        <h4 className="text-xs font-black text-zinc-500 uppercase tracking-widest">Recent Diagnostics Events</h4>
        {snapshot.recentEvents.length === 0 ? (
          <div className="text-center py-8 text-zinc-600 text-xs italic">
            No diagnostic events recorded in this trading day.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[11px] font-mono">
              <thead>
                <tr className="text-zinc-600 border-b border-zinc-800">
                  <th className="text-right py-2 pr-2 font-black uppercase tracking-wider">Time</th>
                  <th className="text-right py-2 pr-2 font-black uppercase tracking-wider">Category</th>
                  <th className="text-right py-2 pr-2 font-black uppercase tracking-wider">Asset</th>
                  <th className="text-right py-2 pr-2 font-black uppercase tracking-wider">Strategy</th>
                  <th className="text-right py-2 pr-2 font-black uppercase tracking-wider">Reason Code</th>
                  <th className="text-right py-2 pr-2 font-black uppercase tracking-wider">Count</th>
                  <th className="text-right py-2 pr-2 font-black uppercase tracking-wider">Type</th>
                  <th className="text-right py-2 pr-2 font-black uppercase tracking-wider">Details</th>
                </tr>
              </thead>
              <tbody>
                {snapshot.recentEvents.slice(0, 20).map((event, idx) => {
                  const help = CATEGORY_HELP[event.category] || CATEGORY_HELP.BRIDGE_FAILURE;
                  const catColor: Record<EventCategory, string> = {
                    SIGNAL_FILTERED: 'text-blue-400',
                    RISK_BLOCKED: 'text-amber-400',
                    EXECUTION_FAILED: 'text-rose-400',
                    BRIDGE_FAILURE: 'text-rose-400',
                    CIRCUIT_BREAKER_TRANSITION: 'text-purple-400',
                    CIRCUIT_BREAKER_SUPPRESSED: 'text-zinc-400',
                  };
                  return (
                    <tr key={idx} className="border-b border-zinc-900 hover:bg-zinc-900/30 transition-colors">
                      <td className="py-2 pr-2 text-zinc-500 whitespace-nowrap">
                        {new Date(event.timestamp).toLocaleTimeString()}
                      </td>
                      <td className="py-2 pr-2">
                        <span className={`font-black uppercase ${catColor[event.category] || 'text-zinc-400'}`}>
                          {event.category.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="py-2 pr-2 text-zinc-300">
                        {event.asset || '—'}
                      </td>
                      <td className="py-2 pr-2 text-zinc-400">
                        {event.strategy || '—'}
                      </td>
                      <td className="py-2 pr-2">
                        <code className="bg-zinc-900 px-1.5 py-0.5 rounded text-[10px] text-zinc-300">
                          {event.reasonCode}
                        </code>
                      </td>
                      <td className="py-2 pr-2 text-zinc-300">
                        {event.occurrenceCount}
                        {event.occurrenceCount > 1 && (
                          <span className="text-zinc-600 text-[9px] ml-1">(×{event.occurrenceCount})</span>
                        )}
                      </td>
                      <td className="py-2 pr-2">
                        <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-black uppercase tracking-wider ${
                          event.isExpectedBlock
                            ? 'bg-zinc-800 text-zinc-400'
                            : 'bg-rose-500/20 text-rose-400'
                        }`}>
                          {event.isExpectedBlock ? 'Expected' : 'Incident'}
                        </span>
                      </td>
                      <td className="py-2 pr-2 text-zinc-500 max-w-[200px] truncate cursor-help" title={event.reason}>
                        {event.reason.length > 40 ? event.reason.slice(0, 40) + '…' : event.reason}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Main DiagnosticsSettings Component ─────────────────────────────

export const DiagnosticsSettings: React.FC<DiagnosticsSettingsProps> = ({ config }) => {
  const [report, setReport] = useState<any>(null);
  const [hunterSnapshot, setHunterSnapshot] = useState<any>(null);
  const [hunterDecisions, setHunterDecisions] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [hours, setHours] = useState<string>("24");
  const [backtestLoading, setBacktestLoading] = useState<boolean>(false);
  const [backtestResult, setBacktestResult] = useState<any>(null);
  const [backtestStrategy, setBacktestStrategy] = useState<string>('BTC_TREND');
  const [backtestAsset, setBacktestAsset] = useState<string>('BTC-PERP');
  const [rlLoading, setRlLoading] = useState<boolean>(false);
  const [rlResult, setRlResult] = useState<any>(null);
  const [rlEpisodes, setRlEpisodes] = useState<string>('200');
  const [rlStateSpace, setRlStateSpace] = useState<string>('50');
  const [rlActionSpace, setRlActionSpace] = useState<string>('5');
  const [rlLearningRate, setRlLearningRate] = useState<string>('0.0003');

  const strategyOptions = strategyRegistryService.getEnabledStrategies();
  const supportedAssets = new MultiAssetManager(async () => ({}), async () => []).getSupportedAssets();

  const buildSampleBacktestData = () => {
    const now = Date.now();
    return Array.from({ length: 90 }, (_, index) => {
      const base = 50000 + index * 35 + Math.sin(index / 6) * 400;
      return {
        timestamp: now - (90 - index) * 24 * 60 * 60 * 1000,
        open: base - 40,
        high: base + 120,
        low: base - 140,
        close: base + Math.sin(index / 4) * 60,
        volume: 1000 + index * 8,
      };
    });
  };

  const fetchReport = async () => {
    setLoading(true);
    const parsedHours = parseInt(hours) || 24;
    try {
      const data = executionSanityDiagnosticService.generateDiagnosticReport(parsedHours * 60 * 60 * 1000);
      setReport(data);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  const fetchHunterDiagnostics = async () => {
    try {
      const [snapRes, decisionsRes] = await Promise.all([
        fetch('/api/diagnostics/hunter-mode'),
        fetch('/api/diagnostics/hunter-mode/last-decisions?limit=8'),
      ]);
      const snapData = await snapRes.json();
      const decisionsData = await decisionsRes.json();
      setHunterSnapshot(snapData || null);
      setHunterDecisions(Array.isArray(decisionsData?.decisions) ? decisionsData.decisions : []);
    } catch {
      setHunterSnapshot(null);
      setHunterDecisions([]);
    }
  };

  useEffect(() => {
    const parsed = parseInt(hours);
    if (!isNaN(parsed) && parsed > 0) {
      fetchReport();
    }
  }, [hours]);

  useEffect(() => {
    fetchHunterDiagnostics();
    const timer = setInterval(fetchHunterDiagnostics, 5000);
    return () => clearInterval(timer);
  }, []);

  const runBacktest = async () => {
    setBacktestLoading(true);
    try {
      const effectiveUrl = getEffectiveUrl(config.webhookUrl).replace(/\/$/, '');
      const response = await fetch(`${effectiveUrl}/api/backtest/run`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          strategyType: backtestStrategy,
          asset: backtestAsset,
          initialCapital: 10000,
          startDate: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(),
          endDate: new Date().toISOString(),
          data: buildSampleBacktestData(),
          config: {
            minSignalScore: 0,
            hunterMode: false,
            strategyGates: config.strategyGates,
          },
        }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || 'Backtest request failed');
      }

      setBacktestResult(payload);
    } catch (e: any) {
      setBacktestResult({ error: e?.message || 'Backtest failed' });
    }
    setBacktestLoading(false);
  };

  const runRlTraining = async () => {
    setRlLoading(true);
    try {
      const effectiveUrl = getEffectiveUrl(config.webhookUrl).replace(/\/$/, '');
      const response = await fetch(`${effectiveUrl}/api/rl/train`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          episodes: parseInt(rlEpisodes, 10) || 200,
          stateSpace: parseInt(rlStateSpace, 10) || 50,
          actionSpace: parseInt(rlActionSpace, 10) || 5,
          learningRate: parseFloat(rlLearningRate) || 0.0003,
          data: buildSampleBacktestData(),
        }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || 'RL training failed');
      }

      try {
        await fetch(`${effectiveUrl}/api/rl/policy`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            policy: payload.policy,
            enabled: true,
          }),
        });
      } catch {
        // Policy publishing is best-effort; training result still shown
      }

      setRlResult(payload);
    } catch (e: any) {
      setRlResult({ error: e?.message || 'RL training failed' });
    }
    setRlLoading(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-3xl font-black text-white italic tracking-tighter">تشخيص نافذة التنفيذ</h2>
        <div className="flex items-center gap-3">
          <label className="text-xs text-zinc-400">النافذة الزمنية (ساعات):</label>
          <input
            type="number"
            value={hours}
            onChange={(e) => setHours(e.target.value)}
            className="bg-zinc-900 border border-zinc-800 text-white rounded p-2 text-sm w-20 text-center"
          />
          <button onClick={fetchReport} className="bg-zinc-800 hover:bg-zinc-700 text-white px-4 py-2 rounded text-xs">
            تحديث
          </button>
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════
         V2 DIAGNOSTICS PANEL (Primary)
         ════════════════════════════════════════════════════════ */}
      <div className="bg-zinc-900/50 p-6 rounded-2xl border border-zinc-800">
        <V2DiagnosticsPanel />
      </div>

      {loading && <div className="text-zinc-500 text-sm">جاري التحميل...</div>}

      {!loading && report && (
        <div className="space-y-6">
          {/* Reinforcement Learning */}
          <div className="bg-zinc-900/50 p-6 rounded-2xl border border-zinc-800 space-y-5">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-bold text-white">Reinforcement Learning</h3>
              <button
                onClick={runRlTraining}
                className="bg-cyan-600 hover:bg-cyan-500 text-white px-4 py-2 rounded text-xs font-black uppercase tracking-widest disabled:opacity-60"
                disabled={rlLoading}
              >
                {rlLoading ? 'Training...' : 'Train RL Agent'}
              </button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className="text-[11px] font-black text-zinc-500 uppercase tracking-widest block mb-2">Episodes</label>
                <input
                  type="number"
                  value={rlEpisodes}
                  onChange={(e) => setRlEpisodes(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 text-white rounded p-3 text-sm"
                />
              </div>
              <div>
                <label className="text-[11px] font-black text-zinc-500 uppercase tracking-widest block mb-2">State Space</label>
                <input
                  type="number"
                  value={rlStateSpace}
                  onChange={(e) => setRlStateSpace(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 text-white rounded p-3 text-sm"
                />
              </div>
              <div>
                <label className="text-[11px] font-black text-zinc-500 uppercase tracking-widest block mb-2">Action Space</label>
                <input
                  type="number"
                  value={rlActionSpace}
                  onChange={(e) => setRlActionSpace(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 text-white rounded p-3 text-sm"
                />
              </div>
              <div>
                <label className="text-[11px] font-black text-zinc-500 uppercase tracking-widest block mb-2">Learning Rate</label>
                <input
                  type="number"
                  step="0.0001"
                  value={rlLearningRate}
                  onChange={(e) => setRlLearningRate(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 text-white rounded p-3 text-sm"
                />
              </div>
            </div>

            {rlResult && !rlResult.error && (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                  <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-4">
                    <div className="text-xl font-black text-white">{rlResult.episodes}</div>
                    <div className="text-[10px] text-zinc-500">Episodes</div>
                  </div>
                  <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-4">
                    <div className="text-xl font-black text-cyan-400">{rlResult.stateSpace}</div>
                    <div className="text-[10px] text-zinc-500">State Space</div>
                  </div>
                  <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-4">
                    <div className="text-xl font-black text-amber-400">{rlResult.actionSpace}</div>
                    <div className="text-[10px] text-zinc-500">Action Space</div>
                  </div>
                  <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-4">
                    <div className="text-xl font-black text-emerald-400">{Number(rlResult.finalEpisode?.totalReward || 0).toFixed(2)}</div>
                    <div className="text-[10px] text-zinc-500">Final Reward</div>
                  </div>
                </div>

                <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-4">
                  <div className="text-xs text-zinc-500 mb-2">Recent Episode Rewards</div>
                  <div className="space-y-2 max-h-40 overflow-y-auto custom-scrollbar">
                    {(rlResult.summaries || []).slice(-12).map((item: any) => (
                      <div key={item.episode} className="flex justify-between text-[11px] text-zinc-300 border-b border-zinc-900 pb-2">
                        <span>Episode {item.episode}</span>
                        <span className="font-mono text-white">{Number(item.totalReward || 0).toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-4">
                  <div className="text-xs text-zinc-500 mb-2">Policy Snapshot Preview</div>
                  <pre className="text-[10px] text-zinc-300 overflow-x-auto whitespace-pre-wrap max-h-40 overflow-y-auto custom-scrollbar">
                    {JSON.stringify((rlResult.policy || []).slice(0, 2), null, 2)}
                  </pre>
                </div>
              </>
            )}

            {rlResult?.error && (
              <div className="bg-rose-500/10 border border-rose-500/30 text-rose-300 p-4 rounded-xl text-sm">
                {rlResult.error}
              </div>
            )}
          </div>

          {/* Backtesting */}
          <div className="bg-zinc-900/50 p-6 rounded-2xl border border-zinc-800 space-y-5">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-bold text-white">Backtesting</h3>
              <button
                onClick={runBacktest}
                className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded text-xs font-black uppercase tracking-widest disabled:opacity-60"
                disabled={backtestLoading}
              >
                {backtestLoading ? 'Running...' : 'Run Backtest'}
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-[11px] font-black text-zinc-500 uppercase tracking-widest block mb-2">Strategy</label>
                <select
                  value={backtestStrategy}
                  onChange={(e) => setBacktestStrategy(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 text-white rounded p-3 text-sm"
                >
                  {strategyOptions.map((strategy) => (
                    <option key={strategy.strategyId} value={strategy.strategyId}>
                      {strategy.strategyId} | {strategy.style}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[11px] font-black text-zinc-500 uppercase tracking-widest block mb-2">Asset</label>
                <select
                  value={backtestAsset}
                  onChange={(e) => setBacktestAsset(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 text-white rounded p-3 text-sm"
                >
                  {supportedAssets.map((asset) => (
                    <option key={asset.symbol} value={asset.symbol.replace('USD', '-PERP')}>
                      {asset.symbol} | {asset.volatility}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-4">
                <div className="text-[11px] font-black text-zinc-500 uppercase tracking-widest mb-3">Data Sources</div>
                <div className="space-y-2">
                  <div className="flex justify-between"><span className="text-zinc-400">Enabled Strategies</span><span className="text-white font-bold">{strategyOptions.length}</span></div>
                  <div className="flex justify-between"><span className="text-zinc-400">Supported Assets</span><span className="text-white font-bold">{supportedAssets.length}</span></div>
                  <div className="flex justify-between"><span className="text-zinc-400">Registry Source</span><span className="text-white font-bold">strategyRegistryService</span></div>
                </div>
              </div>
              <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-4">
                <div className="text-[11px] font-black text-zinc-500 uppercase tracking-widest mb-3">Asset Frames</div>
                <div className="grid grid-cols-2 gap-2">
                  {supportedAssets.map((asset) => (
                    <div key={asset.symbol} className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3">
                      <div className="font-black text-white">{asset.symbol}</div>
                      <div className="text-zinc-500">{asset.volatility}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {backtestResult && !backtestResult.error && backtestResult.result && (
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-center">
                <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-4">
                  <div className="text-xl font-black text-emerald-400">{(Number(backtestResult.result.totalReturn || 0) * 100).toFixed(2)}%</div>
                  <div className="text-[10px] text-zinc-500">Total Return</div>
                </div>
                <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-4">
                  <div className="text-xl font-black text-rose-400">{(Number(backtestResult.result.maxDrawdown || 0) * 100).toFixed(2)}%</div>
                  <div className="text-[10px] text-zinc-500">Max Drawdown</div>
                </div>
                <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-4">
                  <div className="text-xl font-black text-cyan-400">{Number(backtestResult.result.sharpeRatio || 0).toFixed(2)}</div>
                  <div className="text-[10px] text-zinc-500">Sharpe</div>
                </div>
                <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-4">
                  <div className="text-xl font-black text-amber-400">{(Number(backtestResult.result.winRate || 0) * 100).toFixed(1)}%</div>
                  <div className="text-[10px] text-zinc-500">Win Rate</div>
                </div>
                <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-4">
                  <div className="text-xl font-black text-white">{Number(backtestResult.result.profitFactor || 0).toFixed(2)}</div>
                  <div className="text-[10px] text-zinc-500">Profit Factor</div>
                </div>
              </div>
            )}

            {backtestResult?.result?.trades && (
              <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-4 text-sm text-zinc-300">
                Trades: <span className="text-white font-bold">{backtestResult.result.trades.length}</span>
                {' | '}Ending Capital: <span className="text-white font-bold">${Number(backtestResult.result.endingCapital || 0).toFixed(2)}</span>
              </div>
            )}

            {backtestResult?.error && (
              <div className="bg-rose-500/10 border border-rose-500/30 text-rose-300 p-4 rounded-xl text-sm">
                {backtestResult.error}
              </div>
            )}
          </div>

          {/* Hunter Mode Diagnostics */}
          <div className="bg-zinc-900/50 p-6 rounded-2xl border border-zinc-800 space-y-5">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-bold text-white">Hunter Mode Diagnostics</h3>
              <span className={`text-xs font-black px-3 py-1 rounded ${config.hunterModeEnabled ? 'bg-emerald-500/20 text-emerald-400' : 'bg-zinc-800 text-zinc-300'}`}>
                {config.hunterModeEnabled ? 'ON' : 'OFF'}
              </span>
            </div>

            <div className="grid grid-cols-4 gap-3 text-center">
              <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-3">
                <div className="text-xl font-black text-white">{hunterSnapshot?.totalEvaluations ?? 0}</div>
                <div className="text-[10px] text-zinc-500">Evaluated</div>
              </div>
              <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-3">
                <div className="text-xl font-black text-emerald-400">{hunterSnapshot?.enabledEvaluations ?? 0}</div>
                <div className="text-[10px] text-zinc-500">Enabled</div>
              </div>
              <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-3">
                <div className="text-xl font-black text-rose-400">{hunterSnapshot?.rejectedEvaluations ?? 0}</div>
                <div className="text-[10px] text-zinc-500">Rejected</div>
              </div>
              <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-3">
                <div className="text-xl font-black text-amber-400">{hunterSnapshot?.activeHunterTrades ?? 0}</div>
                <div className="text-[10px] text-zinc-500">Active Hunter Trades</div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 text-xs">
              <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-3 text-zinc-300 space-y-1">
                <div>Last Score: <span className="text-white font-bold">{hunterSnapshot?.lastDecision?.decision?.score ?? '-'}</span></div>
                <div>Size Multiplier: <span className="text-white font-bold">{config.hunterSizeMultiplier ?? 1.25}</span></div>
                <div>Target Multiplier: <span className="text-white font-bold">{config.hunterTargetMultiplier ?? 1.2}</span></div>
                <div>Max Concurrent Hunter Trades: <span className="text-white font-bold">{config.hunterMaxConcurrentHunterTrades ?? 3}</span></div>
              </div>
              <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-3 text-zinc-300">
                <div className="mb-2 text-zinc-500">Last Reasons/Blockers</div>
                <div className="space-y-1 max-h-24 overflow-y-auto">
                  {(hunterSnapshot?.lastDecision?.decision?.enabled
                    ? hunterSnapshot?.lastDecision?.decision?.reasons
                    : hunterSnapshot?.lastDecision?.decision?.blockers || []).slice(0, 5).map((item: string, idx: number) => (
                    <div key={idx} className="text-[11px] text-zinc-300">- {item}</div>
                  ))}
                </div>
              </div>
            </div>

            <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-3">
              <div className="text-xs text-zinc-500 mb-2">Latest Decisions</div>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {hunterDecisions.slice().reverse().map((item, idx) => (
                  <div key={idx} className="text-[11px] text-zinc-300 border-b border-zinc-900 pb-2">
                    <span className={item?.decision?.enabled ? 'text-emerald-400' : 'text-rose-400'}>
                      {item?.decision?.enabled ? 'ENABLED' : 'REJECTED'}
                    </span>
                    {' | '}
                    {item?.asset || 'UNKNOWN'}
                    {' | score='}
                    {item?.decision?.score ?? '-'}
                  </div>
                ))}
                {hunterDecisions.length === 0 && <div className="text-[11px] text-zinc-500">No hunter decisions yet.</div>}
              </div>
            </div>
          </div>

          {/* Asset Performance Monitor */}
          <div className="bg-zinc-900/50 p-6 rounded-2xl border border-zinc-800">
            <AssetPerformancePanel />
          </div>

          {/* Documentation */}
          <div className="bg-amber-500/10 border border-amber-500/30 text-amber-200 p-4 rounded-xl text-sm">
            <strong className="text-amber-500 mb-2 block">لماذا قد تكون هناك حالات "موافق عليها" دون فتح صفقات فعلية في MT5 (بيئة حقيقية/محلية)؟</strong>
            <ul className="list-disc list-inside space-y-1">
              <li><strong>انتهاء صلاحية الإشارة:</strong> يتم حذف الصفقة من طابور الجسر (Bridge Queue) تلقائياً إذا لم يقم الإكسبرت (EA) بسحبها خلال 30 ثانية. تأكد من أن الإكسبرت يعمل ويتصل بانتظام.</li>
              <li><strong>خطأ في الرموز (Symbols):</strong> قد يكون الوسيط (Broker) يستخدم لاحقة للرموز (مثل BTCUSD.pro أو BTCUSDm). النظام يرسل "BTCUSD". راجع سجل الخبراء (Experts tab) في MT5 للتأكد.</li>
              <li><strong>رفض من منصة MT5:</strong> قد يرفض الوسيط تنفيذ الصفقة بسبب (رصيد غير كافٍ، حجم اللوت أقل من المسموح به، أو السبريد مرتفع جداً وقت وصول الصفقة).</li>
              <li><strong>إعدادات MT5:</strong> تأكد من تفعيل زر "التداول الآلي" (Algo Trading) في منصة MT5، وأن الإكسبرت لديه صلاحية التداول.</li>
            </ul>
          </div>

          {/* Legacy Execution Sanity Report */}
          <div className="grid grid-cols-6 gap-4">
            <div className="bg-zinc-900 p-4 rounded-xl border border-zinc-800 text-center">
              <div className="text-3xl font-black text-white">{report.totalOpportunities}</div>
              <div className="text-xs text-zinc-500 mt-1 uppercase">إجمالي الفرص</div>
            </div>
            <div className="bg-zinc-900 p-4 rounded-xl border border-zinc-800 text-center">
              <div className="text-3xl font-black text-emerald-500">{report.approvedCount}</div>
              <div className="text-xs text-zinc-500 mt-1 uppercase">الموافق عليها</div>
            </div>
            <div className="bg-zinc-900 p-4 rounded-xl border border-zinc-800 text-center">
              <div className="text-3xl font-black text-rose-500">{report.rejectedCount}</div>
              <div className="text-xs text-zinc-500 mt-1 uppercase">المرفوضة</div>
            </div>
            <div className="bg-zinc-900 p-4 rounded-xl border border-zinc-800 text-center">
              <div className="text-3xl font-black text-amber-500">{report.skippedCount}</div>
              <div className="text-xs text-zinc-500 mt-1 uppercase">تم التخطي</div>
            </div>
            <div className="bg-zinc-900 p-4 rounded-xl border border-zinc-800 text-center">
              <div className="text-3xl font-black text-rose-800">{report.errorCount}</div>
              <div className="text-xs text-zinc-500 mt-1 uppercase">أخطاء</div>
            </div>
            <div className="bg-zinc-900 p-4 rounded-xl border border-zinc-800 text-center flex flex-col justify-center">
                <div className="text-[10px] text-zinc-400">من {new Date(report.windowStartTime).toLocaleTimeString()}</div>
                <div className="text-[10px] text-zinc-400">إلى {new Date(report.windowEndTime).toLocaleTimeString()}</div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div className="bg-zinc-900/50 p-6 rounded-2xl border border-zinc-800">
                <h3 className="text-lg font-bold text-white mb-4">تصنيف الرفض حسب المرحلة</h3>
                {Object.entries(report.rejectionByStage || {}).length > 0 ? (
                    <div className="space-y-3">
                        {Object.entries(report.rejectionByStage).map(([stage, count]: any) => (
                            <div key={stage} className="flex justify-between items-center border-b border-zinc-800 pb-2">
                                <span className="text-sm font-bold text-zinc-300">{stage}</span>
                                <span className="text-rose-500 font-bold">{count}</span>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="text-zinc-500 text-sm">لا يوجد حالات رفض</div>
                )}
            </div>
            <div className="bg-zinc-900/50 p-6 rounded-2xl border border-zinc-800 overflow-hidden flex flex-col">
                <h3 className="text-lg font-bold text-white mb-4">أحدث حالات الرفض</h3>
                <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-3">
                    {report.recentRejections && report.recentRejections.length > 0 ? (
                        report.recentRejections.slice().reverse().map((rej: any, i: number) => (
                            <div key={i} className="bg-zinc-950 p-3 rounded-lg border border-zinc-800">
                                <div className="flex justify-between items-center mb-2">
                                    <span className="text-xs font-bold text-rose-400">{rej.stage}</span>
                                    <span className="text-[10px] text-zinc-600">{new Date(rej.timestamp).toLocaleTimeString()}</span>
                                </div>
                                <div className="text-xs text-zinc-300">
                                    <span className="text-amber-500 font-bold">[{rej.asset || 'SYS'}]</span> {rej.reason}
                                </div>
                                {rej.reasonCode && rej.reasonCode !== 'UNKNOWN' && (
                                    <div className="mt-2 text-[10px] text-zinc-500 font-mono bg-zinc-900 inline-block px-2 py-1 rounded">
                                        Code: {rej.reasonCode}
                                    </div>
                                )}
                            </div>
                        ))
                    ) : (
                        <div className="text-zinc-500 text-sm">لا يوجد سجلات</div>
                    )}
                </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

