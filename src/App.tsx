import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  clearRemoteBridge,
  getEffectiveUrl,
} from "./services/webhookService";
import { sendTestMessage } from "./services/telegramService";
import {
  TradingSignal,
  AppConfig,
  MarketAnalysisState,
  SignalDirection,
  SignalStrength,
  StrategyType,
} from "./types";
import { getMQL5Code } from "./utils/mqlCode";
import {
  CURRENT_VERSION,
  GOLD_MAX_PRICE_AGE_MS,
  MARKET_POLL_INTERVAL_MS,
  PROCESS_ASSET_STAGGER_MS,
} from "./utils/constants";
import { checkBridgeStatus } from "./services/webhookService";
import { strategyRegistryService } from "./services/StrategyRegistryService";
import { MultiAssetManager } from "./services/MultiAssetManager";

// ─────────────────── Hooks ───────────────────
import { useSettings } from "./hooks/useSettings";
import { useLogger } from "./hooks/useLogger";
import { useBridgeSync } from "./hooks/useBridgeSync";
import { useMarketData } from "./hooks/useMarketData";
import { useSignalEngine } from "./hooks/useSignalEngine";
import { usePerformanceMetrics } from "./hooks/usePerformanceMetrics";
import { useRebalance } from "./hooks/useRebalance";

// ─────────────────── Components ───────────────────
import MarketStats from "./components/MarketStats";
import SignalCard from "./components/SignalCard";
import { TradePipeline } from "./components/TradePipeline";
import { LogsPanel } from "./components/LogsPanel";
import { EngineSettings } from "./components/EngineSettings";
import { RiskManagementSettings } from "./components/RiskManagementSettings";
import { TrailingChaseSettings } from "./components/TrailingChaseSettings";
import { HedgeSettings } from "./components/HedgeSettings";
import { Mql5Settings } from "./components/Mql5Settings";
import { DiagnosticsSettings } from "./components/DiagnosticsSettings";

const App: React.FC = () => {
  // ═══════════════════════════════════════
  //  HOOKS: config, logger, bridge, market, signals, perf, rebalance
  // ═══════════════════════════════════════

  const { config, setConfig, updateConfig, resetConfig, DEFAULT_CONFIG } =
    useSettings();
  const { logs: _logs, addLog } = useLogger();
  const {
    bridgeStatus,
    managedTrades,
    managedTradesRef,
    crlState,
    crlStateRef,
    tradeHistory,
    updateTradeHistory,
  } = useBridgeSync(config.webhookUrl, addLog);
  const {
    btcAnalysis,
    setBtcAnalysis,
    ethAnalysis,
    setEthAnalysis,
    goldAnalysis,
    setGoldAnalysis,
    btcDataRef,
    ethDataRef,
    goldDataRef,
    marketWsConnected,
    marketWsUrl,
    wsReconnectAttempts,
    marketWsRef,
    wsMarketConnectedRef,
    isProcessingRef,
    manualReconnect,
    updateMarketDataRef,
  } = useMarketData(config.webhookUrl, addLog);
  const {
    signals,
    sendingRef,
    sentSignalsRef,
    lastSignalTimeRef,
    lastExecutedTimeRef,
    noSignalsAlertSentRef,
    connectionDisabledRef,
    processAsset,
    handleSendSignal,
  } = useSignalEngine(
    config,
    bridgeStatus,
    addLog,
    crlStateRef,
    managedTradesRef,
    updateTradeHistory,
    setBtcAnalysis,
    setEthAnalysis,
    setGoldAnalysis,
    btcDataRef,
    ethDataRef,
    goldDataRef,
  );
  const performanceMetrics = usePerformanceMetrics(tradeHistory);
  const {
    rebalanceOrders,
    isRebalancing,
    handlePreviewRebalance,
    setRebalanceOrders,
  } = useRebalance(addLog, btcDataRef, ethDataRef, managedTradesRef, crlStateRef);

  // ═══════════════════════════════════════
  //  UI STATE (stays local — not domain logic)
  // ═══════════════════════════════════════

  const [activeTab, setActiveTab] = useState<"DASHBOARD" | "HISTORY">(
    "DASHBOARD",
  );
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<
    | "ENGINE"
    | "RISK_COMPLIANCE"
    | "STRATEGY"
    | "CHASE"
    | "SYSTEM"
    | "MQL5"
    | "DIAGNOSTICS"
  >("ENGINE");

  // ═══════════════════════════════════════
  //  MANUAL CLOSE (keeps this local handler)
  // ═══════════════════════════════════════

  const handleManualClose = useCallback(
    async (ticket: string) => {
      const closeSignal = {
        id: `MANUAL_CLOSE_${Date.now()}`,
        timestamp: Date.now(),
        asset: "",
        direction: SignalDirection.LONG,
        strength: SignalStrength.STANDARD,
        entry: 0,
        stopLoss: 0,
        takeProfit: 0,
        tp1: 0,
        tp2: 0,
        qualityScore: 100,
        reasoning: "Manual Close",
        strategy: "WAIT",
        ticket: ticket,
        action: "CLOSE",
        details: {
          volumeMultiplier: 1,
          fundingRate: 0,
          correlationScore: 0,
          fisher: 0,
          volatilityPremium: 0,
          statisticalEdge: 0,
          quantRegime: "",
          vwap: 0,
          vwapDeviation: 0,
          hurstExponent: 0,
        },
      };

      const analysis = { asset: "", price: 0 } as any;

      await handleSendSignal([closeSignal as any], analysis, "CLOSE");
      addLog(`تم طلب إغلاق يدوي للصفقة ${ticket}`, "EXEC");
    },
    [handleSendSignal, addLog],
  );

  // ═══════════════════════════════════════
  //  30s POLLING LOOP: calls processAsset via useSignalEngine
  // ═══════════════════════════════════════

  useEffect(() => {
    const intervalId = setInterval(async () => {
      if (connectionDisabledRef.current) return;
      await processAsset("BTC");
      await new Promise((r) => setTimeout(r, PROCESS_ASSET_STAGGER_MS));
      await processAsset("ETH");
      await new Promise((r) => setTimeout(r, PROCESS_ASSET_STAGGER_MS));
      await processAsset("GOLD");
    }, MARKET_POLL_INTERVAL_MS);
    return () => clearInterval(intervalId);
  }, [processAsset, connectionDisabledRef]);

  const totalPnL = 0;
  const liveStrategySources = strategyRegistryService.getEnabledStrategies();
  const liveAssetSources = new MultiAssetManager(
    async () => ({
      BTCUSD: 50000,
      ETHUSD: 2500,
      SOLUSD: 100,
      XRPUSD: 0.5,
      GOLD: 2400,
      USDT: 1,
    }),
    async () => []
  ).getSupportedAssets();

  return (
    <div
      className="min-h-screen pb-12 px-6 pt-8 max-w-[1920px] mx-auto space-y-6 text-right font-sans bg-[#050507]"
      dir="rtl"
    >
      {/* Dynamic Settings Command Center */}
      {isSettingsOpen && (
        <div className="fixed inset-0 z-[250] flex items-center justify-center p-6 bg-black/98 backdrop-blur-3xl">
          <div className="glass-card w-full max-w-7xl rounded-[3rem] border-zinc-800 p-0 shadow-[0_0_100px_rgba(0,0,0,0.5)] flex h-[85vh] overflow-hidden">
            {/* Modal Navigation Sidebar */}
            <div className="w-80 bg-zinc-950/50 border-l border-zinc-900 p-10 flex flex-col gap-2 overflow-y-auto custom-scrollbar">
              <div className="mb-10 text-center">
                <div className="w-20 h-20 bg-amber-500 rounded-3xl mx-auto flex items-center justify-center shadow-2xl shadow-amber-500/20 mb-6">
                  <i className="fas fa-terminal text-black text-3xl"></i>
                </div>
                <h3 className="text-white font-black text-xl italic uppercase tracking-tighter">
                  Command Node
                </h3>
                <p className="text-[10px] text-zinc-600 uppercase font-black tracking-widest mt-1">
                  v{CURRENT_VERSION}
                </p>
              </div>
              {[
                { id: "ENGINE", label: "الأساسيات (Engine)", icon: "bolt" },
                {
                  id: "RISK_COMPLIANCE",
                  label: "المخاطر والامتثال",
                  icon: "shield-halved",
                },
                { id: "STRATEGY", label: "استراتيجيات التداول", icon: "robot" },
                {
                  id: "CHASE",
                  label: "الملاحقة والتعطيل",
                  icon: "arrow-trend-up",
                },
                { id: "SYSTEM", label: "النظام والجسر", icon: "server" },
                { id: "MQL5", label: "كود الميتاتريدر (MQL5)", icon: "code" },
                { id: "DIAGNOSTICS", label: "التشخيص (Diagnostics)", icon: "stethoscope" },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setSettingsTab(tab.id as any)}
                  className={`flex items-center gap-5 px-6 py-5 rounded-2xl text-[11px] font-black transition-all ${settingsTab === tab.id ? "bg-white text-black translate-x-[-10px]" : "text-zinc-500 hover:bg-white/5"}`}
                >
                  <i className={`fas fa-${tab.icon} text-lg w-6`}></i>{" "}
                  {tab.label}
                </button>
              ))}
              <div className="mt-auto pt-10 border-t border-zinc-900">
                <button
                  onClick={() => {
                    if (window.confirm("إعادة ضبط كافة البروتوكولات؟"))
                      setConfig(DEFAULT_CONFIG);
                  }}
                  className="w-full text-rose-500 text-[10px] font-black uppercase tracking-widest hover:text-rose-400 transition-all flex items-center justify-center gap-3"
                >
                  <i className="fas fa-undo-alt"></i> استعادة الإعدادات الأصلية
                </button>
              </div>
            </div>

            {/* Modal Viewport */}
            <div className="flex-1 p-20 overflow-y-auto custom-scrollbar relative bg-zinc-950/20">
              <button
                onClick={() => setIsSettingsOpen(false)}
                className="absolute top-10 left-10 w-16 h-16 rounded-full bg-zinc-900 flex items-center justify-center text-zinc-500 hover:text-white hover:bg-zinc-800 transition-all z-10 shadow-2xl"
              >
                <i className="fas fa-times text-2xl"></i>
              </button>

              <div className="max-w-4xl space-y-16 animate-in slide-in-from-left duration-500">
                {/* 1. ENGINE */}
                {settingsTab === "ENGINE" && (
                  <EngineSettings config={config} setConfig={setConfig} />
                )}

                {/* 2. RISK & COMPLIANCE */}
                {settingsTab === "RISK_COMPLIANCE" && (
                  <div className="space-y-12">
                    <h2 className="text-5xl font-black text-white italic tracking-tighter">
                      المخاطر والامتثال
                    </h2>
                    <RiskManagementSettings
                      config={config}
                      setConfig={setConfig}
                    />
                  </div>
                )}

                {/* 3. STRATEGIES */}
                {settingsTab === "STRATEGY" && (
                  <HedgeSettings config={config} setConfig={setConfig} />
                )}

                {/* 4. TRAILING CHASE */}
                {settingsTab === "CHASE" && (
                  <TrailingChaseSettings
                    config={config}
                    setConfig={setConfig}
                  />
                )}

                {/* 8. SYSTEM & BRIDGE */}
                {settingsTab === "SYSTEM" && (
                  <div className="space-y-12">
                    <h2 className="text-5xl font-black text-white italic tracking-tighter">
                      أمان الجسر وإعدادات التليجرام
                    </h2>
                    
                    {/* Telegram Configuration */}
                    <div className="space-y-8 p-8 bg-zinc-900/40 rounded-[2.5rem] border border-zinc-800 group hover:border-indigo-500/30 transition-all">
                      <div className="flex justify-between items-center">
                        <div>
                          <label className="text-xs font-black text-white block mb-1">
                            تفعيل إشعارات التليجرام
                          </label>
                          <p className="text-[10px] text-zinc-500">
                            إرسال الإشعارات والتقارير الفورية
                          </p>
                        </div>
                        <input
                          type="checkbox"
                          checked={config.enableTelegramAlerts}
                          onChange={(e) =>
                            setConfig({
                              ...config,
                              enableTelegramAlerts: e.target.checked,
                            })
                          }
                          className="w-8 h-8 accent-indigo-500 cursor-pointer"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-8">
                        <div className="space-y-4">
                          <div className="space-y-5 p-6 bg-zinc-900/40 rounded-3xl border border-zinc-800">
                            <div className="flex items-center justify-between">
                              <h4 className="text-sm font-black text-white uppercase tracking-widest">
                                Multi-Asset Rebalancing
                              </h4>
                              <span className="text-[10px] text-zinc-500 font-black uppercase tracking-[0.2em]">
                                4.2
                              </span>
                            </div>

                            <button
                              type="button"
                              onClick={handlePreviewRebalance}
                              disabled={isRebalancing}
                              className="w-full py-5 bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 font-black rounded-2xl hover:bg-emerald-500/25 disabled:opacity-60 transition-all text-[11px] uppercase tracking-[0.2em]"
                            >
                              {isRebalancing ? 'Calculating Rebalance...' : 'Rebalance Portfolio (Preview)'}
                            </button>

                            {rebalanceOrders.length === 0 ? (
                              <div className="text-[11px] text-zinc-500 bg-zinc-950/60 border border-zinc-900 rounded-2xl p-4">
                                لا توجد أوامر إعادة توازن حالياً (أو أن الانحرافات ضمن الحدود).
                              </div>
                            ) : (
                              <div className="space-y-3 max-h-64 overflow-y-auto custom-scrollbar">
                                {rebalanceOrders.map((order, idx) => (
                                  <div key={`${order.symbol}-${idx}`} className="bg-zinc-950/70 border border-zinc-900 rounded-2xl p-4">
                                    <div className="flex justify-between items-center mb-2">
                                      <span className="text-white font-black text-xs">{order.symbol}</span>
                                      <span className={`text-xs font-black ${order.action === 'BUY' ? 'text-emerald-400' : 'text-rose-400'}`}>
                                        {order.action}
                                      </span>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2 text-[11px] text-zinc-400 font-mono">
                                      <span>Qty: {order.quantity.toFixed(6)}</span>
                                      <span>Notional: ${order.notionalUSD.toFixed(2)}</span>
                                      <span>Target: {(order.targetWeight * 100).toFixed(1)}%</span>
                                      <span>Current: {(order.currentWeight * 100).toFixed(1)}%</span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>

                          <label className="text-[11px] font-black text-zinc-500 uppercase tracking-widest">
                            Bot Token
                          </label>
                          <input
                            type="password"
                            value={config.telegramBotToken}
                            onChange={(e) =>
                              setConfig({
                                ...config,
                                telegramBotToken: e.target.value,
                              })
                            }
                            className="w-full bg-zinc-900/60 border border-zinc-800 rounded-3xl px-8 py-6 text-white font-mono text-lg focus:border-indigo-500/50 outline-none"
                          />
                        </div>
                        <div className="space-y-4">
                          <label className="text-[11px] font-black text-zinc-500 uppercase tracking-widest">
                            Chat ID
                          </label>
                          <input
                            type="text"
                            value={config.telegramChatId}
                            onChange={(e) =>
                              setConfig({
                                ...config,
                                telegramChatId: e.target.value,
                              })
                            }
                            className="w-full bg-zinc-900/60 border border-zinc-800 rounded-3xl px-8 py-6 text-white font-mono text-lg focus:border-indigo-500/50 outline-none"
                          />
                        </div>
                      </div>
                      <button
                        onClick={async () => {
                          const res = await sendTestMessage(
                            config.telegramBotToken,
                            config.telegramChatId,
                            config.webhookUrl,
                          );
                          addLog(
                            res.success
                              ? "✅ تم إرسال إشعار الاختبار"
                              : "❌ فشل اختبار التليجرام",
                            res.success ? "SYSTEM" : "ERROR",
                          );
                        }}
                        className="w-full py-8 bg-indigo-500 text-white font-black rounded-3xl hover:bg-indigo-400 active:scale-95 transition-all text-sm uppercase tracking-[0.2em] shadow-2xl shadow-indigo-500/20"
                      >
                        اختبار اتصال التليجرام
                      </button>
                    </div>

                    <div className="space-y-8">
                      <div className="space-y-5 p-6 bg-zinc-900/40 rounded-3xl border border-zinc-800">
                        <div className="flex items-center justify-between">
                          <h4 className="text-sm font-black text-white uppercase tracking-widest">
                            WebSocket Telemetry
                          </h4>
                          <div className="flex items-center gap-2">
                            <div
                              className={`w-2.5 h-2.5 rounded-full ${marketWsConnected ? "bg-cyan-400 shadow-[0_0_10px_#22d3ee]" : "bg-zinc-600"}`}
                            ></div>
                            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">
                              {marketWsConnected ? "CONNECTED" : "FALLBACK"}
                            </span>
                          </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-[11px] font-mono">
                          <div className="bg-zinc-950/60 border border-zinc-900 rounded-2xl p-4">
                            <div className="text-zinc-500 mb-1">WS URL</div>
                            <div className="text-cyan-300 break-all">{marketWsUrl || "N/A"}</div>
                          </div>
                          <div className="bg-zinc-950/60 border border-zinc-900 rounded-2xl p-4">
                            <div className="text-zinc-500 mb-1">Reconnect Attempts</div>
                            <div className="text-white">{wsReconnectAttempts}</div>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={manualReconnect}
                          className="w-full py-5 bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 font-black rounded-2xl hover:bg-cyan-500/25 transition-all text-[11px] uppercase tracking-[0.2em]"
                        >
                          Reconnect Now
                        </button>
                      </div>

                      <div className="space-y-4">
                        <div className="flex justify-between items-center">
                          <label className="text-[11px] font-black text-zinc-500 uppercase tracking-widest">
                            رابط الـ Webhook الخاص بـ MT5
                          </label>
                          <span className="text-[10px] text-zinc-500 font-bold">
                            {config.webhookUrl.includes("127.0.0.1") || config.webhookUrl.includes("localhost") ? "🔌 وضع محلي نشط" : "🌐 وضع سحابي نشط"}
                          </span>
                        </div>
                        <input
                          type="text"
                          value={config.webhookUrl}
                          onChange={(e) =>
                            setConfig({ ...config, webhookUrl: e.target.value })
                          }
                          className="w-full bg-zinc-900/60 border border-zinc-800 rounded-3xl px-8 py-6 text-white font-mono text-lg focus:border-zinc-500/50 outline-none"
                        />
                        
                        {/* Quick Connection Presets */}
                        <div className="flex gap-4">
                          <button
                            type="button"
                            onClick={() => {
                              setConfig(prev => ({ ...prev, webhookUrl: "http://127.0.0.1:3000" }));
                              addLog("🔌 تم تغيير الرابط إلى السيرفر المحلي: http://127.0.0.1:3000", "SYSTEM");
                            }}
                            className={`flex-1 py-4 px-6 rounded-2xl text-[11px] font-black tracking-wider transition-all border cursor-pointer ${
                              config.webhookUrl.includes("127.0.0.1") || config.webhookUrl.includes("localhost")
                                ? "bg-amber-500/20 border-amber-500/40 text-amber-500"
                                : "bg-zinc-900/40 border-zinc-900 text-zinc-500 hover:bg-zinc-800/50 hover:text-zinc-300"
                            }`}
                          >
                            💻 تشغيل محلي (Local: 3000)
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setConfig(prev => ({ ...prev, webhookUrl: window.location.origin }));
                              addLog(`🌐 تم تغيير الرابط إلى السيرفر السحابي: ${window.location.origin}`, "SYSTEM");
                            }}
                            className={`flex-1 py-4 px-6 rounded-2xl text-[11px] font-black tracking-wider transition-all border cursor-pointer ${
                              !config.webhookUrl.includes("127.0.0.1") && !config.webhookUrl.includes("localhost")
                                ? "bg-blue-500/20 border-blue-500/40 text-blue-400"
                                : "bg-zinc-900/40 border-zinc-900 text-zinc-500 hover:bg-zinc-800/50 hover:text-zinc-300"
                            }`}
                          >
                            ☁️ تشغيل سحابي (Cloud Run)
                          </button>
                        </div>
                        
                        <p className="text-[10px] text-zinc-500 leading-relaxed bg-zinc-950/40 p-4 rounded-2xl border border-zinc-900">
                          ℹ️ <strong>ملاحظة هامة:</strong> الرابط الافتراضي للمنصة هو المحلي (http://127.0.0.1:3000). وإذا تم تحميل الإعدادات السحابية سابقاً، يرجع ذلك إلى حفظ المتصفح لآخر رابط في الذاكرة التخزينية (LocalStorage) للنطاق السحابي الحالي. يمكنك نقر الزر أعلاه للتحويل الفوري والتخزين المحلي.
                        </p>
                      </div>
                      <div className="space-y-4">
                        <label className="text-[11px] font-black text-zinc-500 uppercase tracking-widest">
                          مفتاح التشفير السري (Secret Key)
                        </label>
                        <input
                          type="password"
                          value={config.webhookSecret}
                          onChange={(e) =>
                            setConfig({
                              ...config,
                              webhookSecret: e.target.value,
                            })
                          }
                          className="w-full bg-zinc-900/60 border border-zinc-800 rounded-3xl px-8 py-6 text-white font-mono text-lg focus:border-zinc-500/50 outline-none"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-8">
                        <button
                          onClick={async () => {
                            if (
                              window.confirm(
                                "هل أنت متأكد من تصفير حالة الجسر؟",
                              )
                            ) {
                              const res = await clearRemoteBridge(
                                config.webhookUrl,
                                config.webhookSecret,
                              );
                              if (res.success) {
                                addLog(
                                  "✅ تم تصفير حالة الجسر بنجاح",
                                  "SYSTEM",
                                );
                              } else {
                                addLog("❌ فشل تصفير حالة الجسر", "ERROR");
                              }
                            }
                          }}
                          className="col-span-2 py-6 bg-rose-500 text-white font-black rounded-3xl hover:bg-rose-600 transition-all text-sm uppercase tracking-[0.2em] shadow-2xl shadow-rose-500/20"
                        >
                          تصفير حالة الجسر
                        </button>
                        <button
                          onClick={async () => {
                            if (
                              window.confirm(
                                "سيتم تصفير كافة السجلات والصفقات في الجسر حالاً. هل أنت متأكد؟",
                              )
                            ) {
                              const res = await clearRemoteBridge(
                                config.webhookUrl,
                                config.webhookSecret,
                              );
                              addLog(
                                res.success
                                  ? "✅ تم تصفير بيانات الجسر"
                                  : "❌ فشل تصفير الجسر",
                                "SYSTEM",
                              );
                            }
                          }}
                          className="py-8 bg-rose-500/10 border border-rose-500/20 text-rose-500 font-black rounded-3xl hover:bg-rose-500 hover:text-white transition-all text-xs uppercase tracking-widest"
                        >
                          تصفير ذاكرة الجسر
                        </button>
                        <button
                          onClick={async () => {
                            addLog("📦 جاري تحضير وتجميع كود المشروع بالكامل في أرشيف مضغوط...", "SYSTEM");
                            try {
                              const response = await fetch(`${window.location.origin}/api/download-source`);
                              if (!response.ok) throw new Error("استجابة غير صالحة من الخادم");
                              const blob = await response.blob();
                              const url = window.URL.createObjectURL(blob);
                              const link = document.createElement("a");
                              link.href = url;
                              link.download = "arkon-trading-app.zip";
                              document.body.appendChild(link);
                              link.click();
                              document.body.removeChild(link);
                              window.URL.revokeObjectURL(url);
                              addLog("✅ تم تنزيل الملف المضغوط arkon-trading-app.zip بنجاح ويحتوي على الكود النقي!", "SYSTEM");
                            } catch (error: any) {
                              addLog(`❌ فشل تحميل الملف المضغوط: ${error?.message || error}`, "SYSTEM");
                            }
                          }}
                          className="w-full bg-blue-600/20 hover:bg-blue-500/30 text-blue-400 font-bold py-6 rounded-3xl transition-all duration-300 transform active:scale-95 flex flex-col justify-center items-center gap-2 text-center items-center justify-center cursor-pointer"
                        >
                          تحميل الكود بالكامل (ZIP)
                        </button>
                        <button
                          onClick={async () => {
                            const isOnline = await checkBridgeStatus(
                              config.webhookUrl,
                            );
                            addLog(
                              isOnline
                                ? "✅ الجسر متصل ومستقر"
                                : "❌ لا يمكن الوصول للجسر",
                              "SYSTEM",
                            );
                          }}
                          className="py-8 bg-zinc-800 text-white font-black rounded-3xl hover:bg-zinc-700 transition-all text-xs uppercase tracking-widest"
                        >
                          تحقق من الاتصال
                        </button>
                        <button
                          onClick={() => {
                            import("./utils/mqlCode").then((m) => {
                              navigator.clipboard.writeText(
                                m.getMQL5Code(
                                  config.webhookUrl,
                                  config.webhookSecret,
                                  config.maxOpenTrades
                                ),
                              );
                              addLog(
                                "📋 تم نسخ كود MQL5 إلى الحافظة",
                                "SYSTEM",
                              );
                            });
                          }}
                          className="py-8 bg-indigo-600 text-white font-black rounded-3xl hover:bg-indigo-500 transition-all text-xs uppercase tracking-widest"
                        >
                          نسخ كود الميتاتريدر
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* 9. MQL5 CODE */}
                {settingsTab === "MQL5" && (
                  <Mql5Settings config={config} addLog={addLog} />
                )}

                {/* 10. DIAGNOSTICS */}
                {settingsTab === "DIAGNOSTICS" && (
                  <DiagnosticsSettings config={config} />
                )}
              </div>

              {/* Global Save Button */}
              <div className="mt-20 pt-10 border-t border-zinc-900 flex justify-end">
                <button
                  onClick={() => {
                    localStorage.setItem(
                      `arkon_config_v${CURRENT_VERSION}`,
                      JSON.stringify(config),
                    );
                    setIsSettingsOpen(false);
                    addLog("💾 تم تطبيق البروتوكول الجديد بنجاح", "SYSTEM");
                  }}
                  className="px-24 py-8 bg-white text-black font-black rounded-3xl uppercase tracking-[0.4em] hover:bg-amber-500 hover:scale-105 transition-all shadow-2xl shadow-white/5 active:scale-95"
                >
                  حفظ وتنشيط الإعدادات
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Persistent Header */}
      <header className="flex justify-between items-center mb-10 px-4">
        <div className="flex items-center gap-10">
          <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center shadow-2xl group cursor-pointer hover:rotate-12 transition-all">
            <span className="text-black font-black text-3xl">A</span>
          </div>
          <div>
            <h1 className="text-4xl font-black text-white uppercase italic tracking-tighter">
              ARKON <span className="text-amber-500">QUANT</span>{" "}
              <span className="text-zinc-800 not-italic ml-2 text-sm uppercase">
                ELITE v{CURRENT_VERSION}
              </span>
            </h1>
            <div className="flex items-center gap-5 mt-2">
              <div
                className={`w-2.5 h-2.5 rounded-full ${bridgeStatus ? "bg-emerald-500 shadow-[0_0_12px_#10b981]" : "bg-rose-500 shadow-[0_0_12px_#f43f5e]"}`}
              ></div>
              <span className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.3em]">
                {bridgeStatus ? "Bridge Relay Connected" : "Relay Disconnected"}
              </span>
              <span className="text-[10px] font-black text-zinc-800 uppercase tracking-[0.3em]">|</span>
              <div
                className={`w-2.5 h-2.5 rounded-full ${marketWsConnected ? "bg-cyan-400 shadow-[0_0_12px_#22d3ee]" : "bg-zinc-600 shadow-[0_0_12px_#52525b]"}`}
              ></div>
              <span className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.3em]">
                {marketWsConnected ? "Market WS Connected" : "Market WS Fallback"}
              </span>
              <span className="text-[10px] font-black text-zinc-800 uppercase tracking-[0.3em]">
                | High-Latency Protected
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-8">
          <button
            onClick={() => setIsSettingsOpen(true)}
            className="group bg-zinc-900 border border-zinc-800 hover:border-amber-500/50 px-8 py-5 rounded-2xl transition-all flex items-center gap-4 shadow-xl"
          >
            <span className="text-[10px] font-black text-white uppercase tracking-widest">
              إدارة البروتوكولات
            </span>
            <i className="fas fa-sliders text-amber-500 group-hover:rotate-90 transition-all"></i>
          </button>
        </div>
      </header>

      <main className="grid grid-cols-1 lg:grid-cols-12 gap-10">
        <div className="lg:col-span-12 space-y-10">
          {activeTab === "DASHBOARD" ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
                <MarketStats
                  title="BTC/USD ALGO"
                  state={btcAnalysis}
                  config={config}
                />
                <MarketStats
                  title="ETH/USD ALGO"
                  state={ethAnalysis}
                  config={config}
                />
                <MarketStats
                  title="XAU/USD ALGO"
                  state={goldAnalysis}
                  config={config}
                />
                {/* Active Trades Panel moved here to utilize space */}
                <div className="glass-card rounded-[4rem] p-8 border border-zinc-900 bg-zinc-950/20 shadow-2xl">
                  <h3 className="text-xl font-black text-white italic uppercase tracking-tighter mb-8 pb-4 border-b border-zinc-900/50">
                    Active Managed Trades
                  </h3>
                  <div className="space-y-4 overflow-y-auto max-h-[300px] custom-scrollbar">
                    {managedTrades.length === 0 ? (
                      <div className="text-center text-zinc-600 text-[10px] italic py-10">
                        No active positions synced
                      </div>
                    ) : (
                      managedTrades.map((trade) => (
                        <div
                          key={trade.ticket || trade.signalId}
                          className="p-4 rounded-3xl bg-zinc-900/50 border border-zinc-800"
                        >
                          <div className="flex justify-between items-center mb-2">
                            <span className="text-xs font-black text-white">
                              {trade.asset.replace("USD", "")}
                            </span>
                            <span
                              className={
                                trade.direction === SignalDirection.LONG
                                  ? "text-emerald-500"
                                  : "text-rose-500"
                              }
                            >
                              {trade.direction}
                            </span>
                          </div>
                          <div className="flex justify-between text-[11px] font-mono text-zinc-400">
                            <span>
                              PnL:{" "}
                              {trade.pnl !== undefined && trade.pnl !== null
                                ? `$${trade.pnl.toFixed(2)}`
                                : "..."}
                            </span>
                            <button
                              onClick={() => handleManualClose(trade.ticket)}
                              className="text-rose-500 hover:text-white"
                            >
                              Close
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>

              <div className="glass-card rounded-[4rem] p-12 border border-zinc-900 bg-zinc-950/20 shadow-2xl relative overflow-hidden">
                <div className="flex justify-between items-center mb-12 border-b border-zinc-900/50 pb-8">
                  <h3 className="text-2xl font-black text-white italic uppercase tracking-tighter">
                    تدفق الإشارات (Quantum Stream)
                  </h3>
                  <div className="flex gap-4 items-center">
                    <span className="text-[10px] text-zinc-600 font-black uppercase tracking-widest">
                      {signals.length} ACTIVE AUDITS
                    </span>
                    <div className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-ping"></div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
                  {signals.length === 0 ? (
                    <div className="col-span-full py-24 text-center opacity-10 flex flex-col items-center">
                      <i className="fas fa-radar text-7xl mb-6"></i>
                      <p className="text-xs font-black uppercase tracking-[0.5em]">
                        Scanning Block Structure...
                      </p>
                    </div>
                  ) : (
                    signals.map((sig) => (
                      <SignalCard
                        key={sig.id}
                        signal={sig}
                        onSend={handleSendSignal}
                        sending={sendingRef.current[sig.id + "ENTRY"] || false}
                        userRiskCap={config.maxAllocationPerTradePercent}
                        isSystemLocked={false}
                      />
                    ))
                  )}
                </div>

                <div className="mt-10 grid grid-cols-1 xl:grid-cols-2 gap-6">
                  <div className="rounded-[2rem] border border-zinc-900 bg-zinc-950/60 p-6">
                    <div className="flex items-center justify-between mb-4">
                      <h4 className="text-sm font-black uppercase tracking-[0.25em] text-white">Strategy Registry</h4>
                      <span className="text-[10px] text-zinc-500 font-black uppercase">{liveStrategySources.length} enabled</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[260px] overflow-y-auto custom-scrollbar pr-1">
                      {liveStrategySources.map((strategy) => (
                        <div key={strategy.strategyId} className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
                          <div className="flex justify-between items-start gap-3">
                            <div>
                              <div className="text-white font-black text-sm">{strategy.strategyId}</div>
                              <div className="text-[11px] text-zinc-500">{strategy.style}</div>
                            </div>
                            <span className="text-[10px] font-black uppercase text-amber-400">{strategy.thematicGroup}</span>
                          </div>
                          <div className="mt-3 text-[10px] text-zinc-400">
                            Assets: {strategy.assetScope.join(', ')}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-[2rem] border border-zinc-900 bg-zinc-950/60 p-6">
                    <div className="flex items-center justify-between mb-4">
                      <h4 className="text-sm font-black uppercase tracking-[0.25em] text-white">Supported Assets</h4>
                      <span className="text-[10px] text-zinc-500 font-black uppercase">{liveAssetSources.length} frames</span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {liveAssetSources.map((asset) => (
                        <div key={asset.symbol} className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
                          <div className="text-white font-black text-sm">{asset.symbol}</div>
                          <div className="text-[11px] text-zinc-500 mt-1">{asset.volatility}</div>
                          <div className="mt-2 h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                            <div className="h-full rounded-full bg-gradient-to-r from-amber-500 to-cyan-400" style={{ width: `${Math.max(20, Math.min(100, asset.weight * 100))}%` }} />
                          </div>
                          <div className="mt-2 text-[10px] text-zinc-400">Weight {Math.round(asset.weight * 100)}%</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <TradePipeline 
              signals={signals} 
              managedTrades={managedTrades} 
              tradeHistory={tradeHistory} 
            />
          )}
        </div>
      </main>

      {/* Footer Navigation Bar */}
      <footer className="fixed bottom-0 left-0 right-0 bg-black/90 backdrop-blur-3xl border-t border-zinc-900 py-6 px-12 flex justify-center items-center gap-20 z-[100] shadow-[0_-20px_50px_rgba(0,0,0,0.5)]">
        <button
          onClick={() => setActiveTab("DASHBOARD")}
          className={`group flex items-center gap-4 text-[11px] font-black uppercase tracking-[0.4em] transition-all ${activeTab === "DASHBOARD" ? "text-amber-500 scale-110" : "text-zinc-700 hover:text-zinc-400"}`}
        >
          <i className="fas fa-chart-line text-lg"></i>
          <span>Dashboard</span>
        </button>
        <button
          onClick={() => setActiveTab("HISTORY")}
          className={`group flex items-center gap-4 text-[11px] font-black uppercase tracking-[0.4em] transition-all ${activeTab === "HISTORY" ? "text-amber-500 scale-110" : "text-zinc-700 hover:text-zinc-400"}`}
        >
          <i className="fas fa-stream text-lg"></i>
          <span>مسار الصفقات</span>
        </button>
      </footer>
    </div>
  );
};

export default App;
