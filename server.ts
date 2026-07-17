import { riskLimitsService } from './src/services/RiskLimitsService';
import { preTradeRiskGuard } from './src/services/PreTradeRiskGuard';
import { tradingControlService } from './src/services/TradingControlService';
import { diagnosticsService } from './src/services/DiagnosticsService';
import { coordinationTraceService } from "./src/services/CoordinationTraceService";
import { executionDecisionTraceService } from "./src/services/ExecutionDecisionTraceService";
import express from "express";
import axios from "axios";
import cors from "cors";
import path from "path";
import https from 'https';
import { exec } from 'child_process';
import * as fs from 'fs';

// Capture console.log for debugging backend
const originalConsoleLog = console.log;
const originalConsoleError = console.error;
const memLogs: string[] = [];
console.log = function(...args) {
    const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' ');
    memLogs.push(`[${new Date().toISOString()}] LOG: ${msg}`);
    if (memLogs.length > 500) memLogs.shift();
    originalConsoleLog.apply(console, args);
};
console.error = function(...args) {
    const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a, Object.getOwnPropertyNames(a)) : a).join(' ');
    memLogs.push(`[${new Date().toISOString()}] ERR: ${msg}`);
    if (memLogs.length > 500) memLogs.shift();
    originalConsoleError.apply(console, args);
};

// Bridge State
let signalQueue: any[] = [];
const MAX_QUEUE_SIZE = 50;
const SIGNAL_EXPIRY_MS = 30000; // 30 seconds
let processedIds = new Set<string>();
let lastHeartbeat = Date.now();
const BRIDGE_SECRET = 'ARKON_SECURE_2025';

// Helper to send to Telegram
const relayToTelegram = (botToken: string, chatId: string, text: string) => {
    const payload = JSON.stringify({
        chat_id: chatId,
        text: text,
        parse_mode: 'HTML',
        disable_web_page_preview: true
    });

    const options = {
        hostname: 'api.telegram.org',
        port: 443,
        path: `/bot${botToken}/sendMessage`,
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload)
        }
    };

    const tgReq = https.request(options, (tgRes) => {
        tgRes.on('data', () => {});
    });
    tgReq.on('error', (e) => console.error(`[TELEGRAM] ❌ Network Error: ${e.message}`));
    tgReq.write(payload);
    tgReq.end();
};

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    credentials: false
  }));
  app.use(express.json({ limit: '10mb' }));
  
  let lastJsonError = '';
  app.use((err: any, req: any, res: any, next: any) => {
    if (err) {
        lastJsonError = err.message + ' | Body: ' + (err.body || 'no body');
        console.error('JSON Parsing Error:', err.message);
        console.error('Raw Body:', err.body);
        return res.status(400).send({ status: 400, message: 'JSON Parse Error: ' + err.message });
    }
    next();
  });





  app.get('/api/diagnostics/risk-limits-snapshot', (req, res) => {
      res.json(riskLimitsService.getSnapshot());
  });

  app.get('/api/diagnostics/pretrade-snapshot', (req, res) => {
      res.json(preTradeRiskGuard.getSnapshot());
  });

  app.get('/api/diagnostics/control-snapshot', (req, res) => {
      res.json(tradingControlService.getSnapshot());
  });
  
  app.post('/api/diagnostics/control/kill-switch/on', (req, res) => {
      tradingControlService.setManualKillSwitch(true);
      res.json(tradingControlService.getSnapshot());
  });
  
  app.post('/api/diagnostics/control/kill-switch/off', (req, res) => {
      tradingControlService.setManualKillSwitch(false);
      res.json(tradingControlService.getSnapshot());
  });
  
  app.post('/api/diagnostics/control/reset', (req, res) => {
      tradingControlService.reset();
      res.json(tradingControlService.getSnapshot());
  });

  app.get('/api/diagnostics/snapshot', (req, res) => {
      res.json(diagnosticsService.getSnapshot());
  });
  
    app.get('/api/diagnostics/execution-sanity', (req, res) => {
    const windowHours = parseInt(req.query.hours as string) || 24;
    const report = executionSanityDiagnosticService.generateDiagnosticReport(windowHours * 60 * 60 * 1000);
    res.json(report);
  });

  app.get('/api/diagnostics/execution-decision-trace', (req, res) => {
      res.json(executionDecisionTraceService.getLatestSnapshot() || {});
  });
  
  app.get("/api/diagnostics/coordination-trace", (req, res) => {
      res.json(coordinationTraceService.getLatestSnapshot() || {});
  });

  app.get('/api/last-error', (req, res) => {
      res.json({ error: lastJsonError });
  });

  app.get('/api/logs', (req, res) => {
      res.type('text/plain').send(memLogs.join('\n'));
  });

  app.get('/api/last-requests', (req, res) => {
      res.json(lastRawRequests);
  });

  let lastRawRequests: any[] = [];
  app.use((req, res, next) => {
    // Only log non-polling requests to avoid spam
    if (!req.url.includes('/bridge/managed-trades')) {
        lastRawRequests.push({ method: req.method, url: req.url, body: req.body, time: Date.now() });
        if (lastRawRequests.length > 500) lastRawRequests.shift();
    }
    
    if (!req.url.includes('/mt5/signals') && !req.url.includes('/bridge/status') && !req.url.includes('/last-raw-requests') && !req.url.includes('/bridge/managed-trades') && !req.url.includes('/mt5/errors')) {
      console.log(`[REQUEST] ${req.method} ${req.url} - Body: ${JSON.stringify(req.body)}`);
    }
    next();
  });

  app.get('/api/last-raw-requests', (req, res) => {
      res.json(lastRawRequests);
  });

  app.use((req, res, next) => {
    if (req.method === 'POST' && (req.url === '/' || req.url === '')) {
      req.url = '/api/signals';
    } else if (req.method === 'GET' && req.url === '/status') {
      req.url = '/api/bridge/status';
    } else if (req.method === 'GET' && req.url === '/signal') {
      req.url = '/api/mt5/signals';
    }
    next();
  });

  // Bridge Routes
  const API_PREFIX = '/api';

  // --- Backward Compatibility & Webhook Fallbacks ---
  app.use((req, res, next) => {
    // Fix double /api/ prefix if user misconfigured WebhookURL
    if (req.url.startsWith('/api/api/')) {
      req.url = req.url.replace('/api/api/', '/api/');
    }

    const map: Record<string, string> = {
      '/signal': '/api/mt5/signals',
      '/api/signal': '/api/mt5/signals',
      '/api/bridge/signals': '/api/mt5/signals',
      '/api/mt5/poll': '/api/mt5/signals',
      '/api/mt5/signals': '/api/mt5/signals',
      '/bridge/state': '/api/mt5/sync',
      '/api/bridge/state/sync': '/api/mt5/sync',
      '/sync': '/api/mt5/sync',
      '/api/sync': '/api/mt5/sync',
      '/mt5/sync': '/api/mt5/sync',
      '/mt5/poll': '/api/mt5/signals',
      '/mt5/signals': '/api/mt5/signals'
    };

    if (req.method === 'POST' && req.path === '/api/bridge/state') {
       req.url = '/api/mt5/sync'; // Only redirect POST. GET is for Dashboard
    } else if (map[req.path]) {
       req.url = map[req.path];
    }
    next();
  });
  // Allow fallback to GET for SendState just in case
  app.get(`${API_PREFIX}/mt5/sync`, (req, res) => {
      res.status(200).json({ status: "received", commands: [] });
  });
  app.get(`${API_PREFIX}/mt5/state`, (req, res) => {
      res.status(200).json({ status: "received", commands: [] });
  });

  app.get(`${API_PREFIX}/ping`, (req, res) => {
    res.json({ status: 'ok', timestamp: Date.now() });
  });

  app.get(`${API_PREFIX}/download-source`, async (req, res) => {
    try {
      const JSZip = (await import('jszip')).default;
      const zip = new JSZip();

      const addDirectoryToZip = (zipInstance: any, dirPath: string, rootDir: string) => {
        const files = fs.readdirSync(dirPath);
        for (const file of files) {
          const fullPath = path.join(dirPath, file);
          const relPath = path.relative(rootDir, fullPath);
          const normalized = relPath.replace(/\\/g, '/');
          
          const lowercaseName = file.toLowerCase();
          if (
            normalized.startsWith('node_modules/') ||
            normalized === 'node_modules' ||
            normalized.startsWith('dist/') ||
            normalized === 'dist' ||
            normalized.startsWith('.git/') ||
            normalized === '.git' ||
            normalized === 'project.tar.gz' ||
            normalized.endsWith('.zip') ||
            normalized.endsWith('.bak') ||
            normalized.endsWith('.backup') ||
            normalized.endsWith('.log') ||
            normalized === 'logs.txt' ||
            lowercaseName.startsWith('test_') ||
            lowercaseName.startsWith('fetch_') ||
            lowercaseName.startsWith('get_') ||
            lowercaseName.startsWith('getlogs') ||
            lowercaseName.startsWith('kill_') ||
            lowercaseName.startsWith('logs.js') ||
            lowercaseName.startsWith('raw.json') ||
            lowercaseName.startsWith('getrequests')
          ) {
            continue;
          }
          
          const stat = fs.statSync(fullPath);
          if (stat.isDirectory()) {
            zipInstance.folder(normalized);
            addDirectoryToZip(zipInstance, fullPath, rootDir);
          } else if (stat.isFile()) {
            const content = fs.readFileSync(fullPath);
            zipInstance.file(normalized, content);
          }
        }
      };

      addDirectoryToZip(zip, process.cwd(), process.cwd());

      const buffer = await zip.generateAsync({
        type: 'nodebuffer',
        compression: 'DEFLATE',
        compressionOptions: { level: 9 }
      });

      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', 'attachment; filename="arkon-trading-app.zip"');
      res.setHeader('Content-Length', buffer.length);
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.send(buffer);
    } catch (err: any) {
      console.error("Archive setup failed", err);
      res.status(500).json({ error: 'Failed to setup zip archive', msg: String(err), stack: err?.stack });
    }
  });

  app.get(`${API_PREFIX}/bridge/status`, (req, res) => {
    res.json({ 
        status: 'online', 
        version: '4.2', 
        queue_depth: signalQueue.length,
        lastMT5SyncTime
    });
  });

  // Binance Proxy
  app.get(`${API_PREFIX}/proxy/exchange-data/bn/*subpath`, async (req, res) => {
    let finalUrl = '';
    try {
      let subpath = (req.params as any)['0'] || (req.params as any).subpath || '';
      if (!subpath) {
        const match = req.path.match(/\/proxy\/exchange-data\/bn\/(.+)$/);
        if (match) {
          subpath = match[1];
        }
      }
      if (Array.isArray(subpath)) subpath = subpath.join('/');
      subpath = subpath.replace(/^\/+/, '').replace(/\/+$/, '');
      
      const targetUrl = `https://api.binance.com/api/v3/${subpath}`;
      const queryParams = new URLSearchParams(req.query as any).toString();
      finalUrl = queryParams ? `${targetUrl}?${queryParams}` : targetUrl;
      
      const binanceRes = await fetch(finalUrl);
      console.log(`[Proxy] Target: ${finalUrl}, Status: ${binanceRes.status}`);
      
      const data = await binanceRes.json();
      res.status(binanceRes.status).json(data);
    } catch (e: any) {
      console.error("[Binance Proxy Error] Target: " + finalUrl + " Error: ", e.message);
      res.status(500).json({ error: e.message });
    }
  });

  app.all(`${API_PREFIX}/mt5/signals`, (req, res) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    // Remove expired signals
    const now = Date.now();
    signalQueue = signalQueue.filter(s => (now - s.queuedAt) < SIGNAL_EXPIRY_MS);
    
    if (signalQueue.length > 0) {
        console.log(`[MT5 SIGNALS] MT5 is checking for signals. Queue length: ${signalQueue.length}`);
    }
    
    const nextSignal = signalQueue.shift();
    if (nextSignal) {
        console.log(`[BRIDGE] 📤 SENT TO MT5: ${nextSignal.asset || nextSignal.symbol || 'Unknown'} | Action: ${nextSignal.action} | Ticket: ${nextSignal.ticket}`);
    }
    res.json(nextSignal || {});
  });

  // Global state to hold managed trades
  let activeManagedTrades: Record<number, any> = {};
  let closedTrades: any[] = [];
  let crlState: any = null;
  let latestSignalRules: Record<string, any> = {}; // Track rules by symbol
  
  const SETTINGS_FILE = path.join(process.cwd(), "settings.json");
  let globalBridgeSettings: any = { forceClosePnL: 0.50 };
  
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
        const fileContent = fs.readFileSync(SETTINGS_FILE, "utf-8");
        globalBridgeSettings = JSON.parse(fileContent);
        console.log("✅ Loaded global bridge settings from disk:", globalBridgeSettings);
    }
  } catch (err) {
    console.error("❌ Failed to parse settings.json", err);
  }
  
  let isInitialSync = true;
let lastMT5SyncTime = 0; // Skip Telegram open notifications for pre-existing trades on startup/restart

  // --- PAPER TRADING SIMULATOR (DISABLED FOR PRODUCTION) ---
  const PAPER_TRADING_MODE = false; // Set to true to simulate MT5 bridge locally during testing
  
  if (PAPER_TRADING_MODE) {
    console.log("[SIMULATOR] Paper Trading engine is ONLINE. MT5 is bypassed locally.");
    setInterval(() => {
        // 1. Process Signal Queue into active trades
        while (signalQueue.length > 0) {
            const sig = signalQueue.shift()!;
            const action = sig.action || sig.action_type;
            const symbol = sig.symbol || sig.asset || 'UNKNOWN';

            if (action === 'ENTRY' || action === 'HEDGE') {
                const fakeTicket = Math.floor(Math.random() * 900000) + 100000;
                let assignedForceClose = globalBridgeSettings.forceClosePnL;
                if (latestSignalRules[symbol] && typeof latestSignalRules[symbol].forceClosePnL === 'number') {
                    assignedForceClose = latestSignalRules[symbol].forceClosePnL;
                }

                activeManagedTrades[fakeTicket] = {
                    ticket: fakeTicket,
                    asset: symbol,
                    symbol: symbol,
                    direction: sig.direction || 'LONG',
                    type: sig.direction === 'LONG' ? 'BUY' : 'SELL',
                    entryPrice: sig.entry || 0,
                    initialVolume: sig.fixedLotSize || (sig.maxAllocation || 0.1),
                    forceClosePnL: assignedForceClose,
                    pnl: -0.50, // Initial spread
                    profit: -0.50,
                    strategy: sig.strategy || 'SIMULATION',
                    timestamp: Date.now()
                };
                console.log(`[SIMULATOR] Created Trade ${fakeTicket} for ${symbol} | PnL Target: ${assignedForceClose}`);
            } else if (action === 'CLOSE' && sig.ticket) {
                // Find and close
                const trade = activeManagedTrades[Number(sig.ticket)];
                if (trade) {
                    trade.closeTime = Date.now();
                    closedTrades.unshift({...trade});
                    delete activeManagedTrades[Number(sig.ticket)];
                    console.log(`[SIMULATOR] Closed Trade ${sig.ticket} from signal.`);
                }
            } else if (action === 'CLOSE_ALL') {
                for (const t in activeManagedTrades) {
                    const trade = activeManagedTrades[t];
                    trade.closeTime = Date.now();
                    closedTrades.unshift({...trade});
                    delete activeManagedTrades[t];
                }
                console.log(`[SIMULATOR] Closed ALL active trades.`);
            }
        }

        // 2. Simulate Market Movement for P&L
        for (const t in activeManagedTrades) {
            const trade = activeManagedTrades[t];
            // Random walk P&L (skewed slightly positive to test targets)
            const drift = (Math.random() - 0.45) * 5; 
            trade.pnl = (trade.pnl || 0) + drift;
            trade.profit = trade.pnl;
            
            const target = trade.forceClosePnL || 0.50;
            if (target > 0 && trade.pnl >= target) {
                console.log(`[SIMULATOR] Simulated TP Hit for ${trade.ticket}. PnL: ${trade.pnl.toFixed(2)}`);
                trade.closeTime = Date.now();
                closedTrades.unshift({...trade});
                delete activeManagedTrades[t];
            } else if (trade.pnl <= -100) {
               console.log(`[SIMULATOR] Simulated SL Hit for ${trade.ticket}. PnL: ${trade.pnl.toFixed(2)}`);
               trade.closeTime = Date.now();
               closedTrades.unshift({...trade});
               delete activeManagedTrades[t];
            }
        }
    }, 2000);
  }
  // --------------------------------

  app.post(`${API_PREFIX}/bridge/settings`, (req, res) => {
    globalBridgeSettings = { ...globalBridgeSettings, ...req.body };
    // Propagate to all active trades
    for (const ticket in activeManagedTrades) {
        if (typeof globalBridgeSettings.forceClosePnL === 'number') {
            activeManagedTrades[ticket].forceClosePnL = globalBridgeSettings.forceClosePnL;
        }
    }
    try {
        fs.writeFileSync(SETTINGS_FILE, JSON.stringify(globalBridgeSettings, null, 2), "utf-8");
        console.log("💾 Saved global bridge settings to disk");
    } catch (err) {
        console.error("❌ Failed to write settings.json", err);
    }
    res.json({ success: true, settings: globalBridgeSettings });
  });
  
  app.get(`${API_PREFIX}/bridge/managed-trades`, (req, res) => {
    res.json({ trades: Object.values(activeManagedTrades), crlState });
  });

  app.get(`${API_PREFIX}/bridge/state`, (req, res) => {
    res.json({ closedTrades, crlState });
  });

  // ✅ BRILLIANT SOLUTION: COMBINED ENDPOINT TO SAVE MT5 API REQUESTS
  // This endpoint accepts the state AND returns pending signals in the SAME response.
  // Instead of 2 requests every 3 seconds, MT5 only needs 1 request every 3 seconds.
  // 50% CPU and bandwidth cost savings.
  app.post(`${API_PREFIX}/mt5/sync`, (req, res) => {
    try {
        lastMT5SyncTime = Date.now();
        const { positions, crl_baseline, crl_current, crl_diff, crl_budget, crl_threshold, equity } = req.body;
        
        if (crl_baseline !== undefined) {
             crlState = {
                  baseline: Number(crl_baseline),
                  current: Number(crl_current),
                  diff: Number(crl_diff),
                  budget: Number(crl_budget),
                  threshold: Number(crl_threshold),
                  equity: equity !== undefined ? Number(equity) : undefined
             };
        }
        
        // 1. Process State
        if (positions && Array.isArray(positions)) {
            const currentTickets = new Set(positions.map((p: any) => p.ticket));
            
            // Handle trade closure notification
            const newlyClosedTrades: any[] = [];
            for (const ticket in activeManagedTrades) {
                if (!currentTickets.has(Number(ticket))) {
                    const closedTrade = activeManagedTrades[ticket];
                    if (closedTrade) {
                         closedTrade.closeTime = Date.now();
                         closedTrade.pnlPoints = closedTrade.pnl; // Final PnL
                         closedTrade.outcome = closedTrade.pnlPoints > 0 ? 'WIN' : 'LOSS';
                         closedTrades.push(closedTrade);
                         newlyClosedTrades.push(closedTrade);
                         
                         // Keep only last 100 closed trades
                         if (closedTrades.length > 100) closedTrades.shift();
                    }
                    delete activeManagedTrades[ticket];
                }
            }

            // --- TELEGRAM NOTIFICATION ON REAL CLOSE (GROUPED) ---
            if (!isInitialSync && newlyClosedTrades.length > 0 && globalBridgeSettings.enableTelegramAlerts && globalBridgeSettings.telegramBotToken && globalBridgeSettings.telegramChatId) {
                let crlSection = '';
                if (crlState) {
                    const budgetLeft = typeof crlState.budget === 'number' ? crlState.budget : 0;
                    const currentProfit = typeof crlState.current === 'number' ? crlState.current : 0;
                    const diffProfit = typeof crlState.diff === 'number' ? crlState.diff : 0;
                    const threshold = typeof crlState.threshold === 'number' ? crlState.threshold : 100;
                    const untilTarget = Math.max(0, threshold - diffProfit);
                    
                    crlSection = `\n\n<b>📊 حالة نظام التعافي (CRL)</b>\n<b>💵 الميزانية المتاحة:</b> $${budgetLeft.toFixed(2)}\n<b>📈 صافي الربح الحالي:</b> $${currentProfit.toFixed(2)}\n<b>🎯 الهدف القادم:</b> ${threshold > 0 ? '$'+threshold.toFixed(2) : 'N/A'}\n<b>🔄 المتبقي للهدف:</b> ${threshold > 0 ? '$'+untilTarget.toFixed(2) : 'N/A'}`;
                }

                if (newlyClosedTrades.length === 1) {
                    const closedTrade = newlyClosedTrades[0];
                    const pnlVal = typeof closedTrade.pnl === 'number' ? closedTrade.pnl : 0;
                    const pnlEmoji = pnlVal >= 0 ? "🟢" : "🔴";
                    const message = `<b>✅ تم تنفيذ الإغلاق: ${closedTrade.asset}</b>\n\n<b>العملية:</b> إغلاق صفقة 🔴\n<b>رقم التذكرة (Ticket):</b> ${closedTrade.ticket}\n<b>الربح/الخسارة (PnL):</b> $${pnlVal.toFixed(2)} ${pnlEmoji}${crlSection}`;
                    try {
                        relayToTelegram(globalBridgeSettings.telegramBotToken, globalBridgeSettings.telegramChatId, message);
                    } catch (e) {
                        console.log(`[TELEGRAM] Error sending closed notification: ${e}`);
                    }
                } else {
                    let totalPnL = 0;
                    let tradesList = '';
                    newlyClosedTrades.forEach(trade => {
                        const pnlVal = typeof trade.pnl === 'number' ? trade.pnl : 0;
                        totalPnL += pnlVal;
                        const pnlEmoji = pnlVal >= 0 ? "🟢" : "🔴";
                        tradesList += `• ${trade.asset} (${trade.ticket}): $${pnlVal.toFixed(2)} ${pnlEmoji}\n`;
                    });
                    const totalEmoji = totalPnL >= 0 ? "🟢" : "🔴";
                    
                    const message = `<b>✅ تم تنفيذ الإغلاق لـ ${newlyClosedTrades.length} صفقات</b>\n\n<b>العملية:</b> إغلاق جماعي 🔴\n\n${tradesList}\n<b>إجمالي الربح/الخسارة:</b> $${totalPnL.toFixed(2)} ${totalEmoji}${crlSection}`;
                    try {
                        relayToTelegram(globalBridgeSettings.telegramBotToken, globalBridgeSettings.telegramChatId, message);
                    } catch (e) {
                        console.log(`[TELEGRAM] Error sending grouped closed notification: ${e}`);
                    }
                }
            }
            
            // Handle trade opening notification
            positions.forEach((pos: any) => {
                if (!activeManagedTrades[pos.ticket]) {
                    const rules = latestSignalRules[pos.symbol] || {};
                    let assignedForceClose = globalBridgeSettings.forceClosePnL;
                    if (typeof rules.forceClosePnL === 'number') assignedForceClose = rules.forceClosePnL;

                    const isLong = pos.direction === 0 || 
                                  String(pos.direction).toLowerCase().includes('buy') || 
                                  String(pos.direction).toUpperCase() === 'LONG';
                    activeManagedTrades[pos.ticket] = {
                        ticket: Number(pos.ticket),
                        asset: pos.symbol,
                        direction: isLong ? 'LONG' : 'SHORT',
                        type: isLong ? 'BUY' : 'SELL',
                        entryPrice: Number(pos.openPrice),
                        initialVolume: Number(pos.volume) || 0,
                        forceClosePnL: assignedForceClose,
                        pnl: 0
                    };
                }

                const managed = activeManagedTrades[pos.ticket];
                if (!managed) return;
                
                let rawPnl = pos.pnl;
                if (rawPnl === undefined || rawPnl === null) rawPnl = pos.netProfit;
                if (rawPnl === undefined || rawPnl === null) rawPnl = pos.profit;
                if (rawPnl === undefined || rawPnl === null) rawPnl = pos.gross;
                if (rawPnl === undefined || rawPnl === null) rawPnl = 0; 
                if (typeof rawPnl === 'string') rawPnl = (rawPnl as string).replace(',', '.');
                
                const pnlValue = Number(rawPnl) || 0;
                managed.pnl = pnlValue;
                
                const volume = Number(pos.volume) || managed.initialVolume || 0.01;
                const baseTarget = typeof managed.forceClosePnL === 'number' ? managed.forceClosePnL : 0.50;
                const target = baseTarget * (volume / 0.01);
                const targetHit = target > 0 && pnlValue >= target;

                if (targetHit) {
                    console.log(`[MANAGEMENT] Target hit! Symbol: ${pos.symbol} Ticket: ${pos.ticket} PnL: ${pnlValue.toFixed(2)} Target: ${target}`);
                    const isCloseQueued = signalQueue.some(s => s.ticket == pos.ticket && s.action === 'CLOSE');
                    if (!isCloseQueued) {
                        signalQueue.push({ action: 'CLOSE', ticket: Number(pos.ticket), symbol: pos.symbol, queuedAt: Date.now() });
                        console.log(`[EXECUTION] Sent FULL CLOSE for ${pos.symbol} ${pos.ticket}`);
                    }
                }
            });

            if (isInitialSync) {
                console.log(`[SYNC] Initial state synced with ${positions.length} active positions. Telegram notifications suppressed for first sync load.`);
                isInitialSync = false;
            }
        }

        // 2. Return Signals (Long Polling disabled here to keep MT5 fast, just return instantly)
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');

        const now = Date.now();
        signalQueue = signalQueue.filter(s => (now - s.queuedAt) < SIGNAL_EXPIRY_MS);
        
        const nextSignal = signalQueue.shift();
        if (nextSignal) {
            console.log(`[SYNC BRIDGE] 📤 SENT TO MT5 via Sync: ${nextSignal.asset || nextSignal.symbol || 'Unknown'} | Action: ${nextSignal.action} | Ticket: ${nextSignal.ticket}`);
        }
        
        res.json(nextSignal || { status: "received", commands: [] });
    } catch (e: any) {
        console.error("[MT5 SYNC ERROR]:", e);
        res.status(500).json({ status: 'error', message: e.message });
    }
  });

  app.post(`${API_PREFIX}/mt5/state`, (req, res) => {
    try {
        const { positions } = req.body;
        console.log(`[MT5 STATE] Received state update. Positions: ${positions?.length || 0}`);
        
        // Purge closed trades
        if (positions && Array.isArray(positions)) {
            const currentTickets = new Set(positions.map((p: any) => p.ticket));
            for (const ticket in activeManagedTrades) {
                if (!currentTickets.has(Number(ticket))) {
                    const closedTrade = activeManagedTrades[ticket];
                    if (closedTrade) {
                         closedTrade.closeTime = Date.now();
                         closedTrade.pnlPoints = closedTrade.pnl; // Final PnL
                         closedTrade.outcome = closedTrade.pnlPoints > 0 ? 'WIN' : 'LOSS';
                         closedTrades.push(closedTrade);
                         
                         // Keep only last 100 closed trades
                         if (closedTrades.length > 100) closedTrades.shift();
                    }
                    delete activeManagedTrades[ticket];
                }
            }
            
            positions.forEach((pos: any) => {
                // Register new positions using the latest known signal rules or global settings
                if (!activeManagedTrades[pos.ticket]) {
                    const rules = latestSignalRules[pos.symbol] || {};
                    
                    let assignedForceClose = globalBridgeSettings.forceClosePnL;
                    if (typeof rules.forceClosePnL === 'number') assignedForceClose = rules.forceClosePnL;

                    const isLong = pos.direction === 0 || 
                                  String(pos.direction).toLowerCase().includes('buy') || 
                                  String(pos.direction).toUpperCase() === 'LONG';
                    activeManagedTrades[pos.ticket] = {
                        ticket: Number(pos.ticket),
                        asset: pos.symbol,
                        direction: isLong ? 'LONG' : 'SHORT',
                        type: isLong ? 'BUY' : 'SELL',
                        entryPrice: Number(pos.openPrice),
                        initialVolume: Number(pos.volume) || 0,
                        forceClosePnL: assignedForceClose
                    };
                }

                const managed = activeManagedTrades[pos.ticket];
                if (!managed) return;
                
                // STRICT MANAGEMENT - Normalize PNL string/number formats (e.g. commas to dots)
                // Fallback for older EA versions that lack 'pnl' key
                let rawPnl = pos.pnl;
                if (rawPnl === undefined || rawPnl === null) rawPnl = pos.netProfit;
                if (rawPnl === undefined || rawPnl === null) rawPnl = pos.profit;
                if (rawPnl === undefined || rawPnl === null) rawPnl = pos.gross;
                if (rawPnl === undefined || rawPnl === null) rawPnl = 0; // Prevent crash if completely missing

                if (typeof rawPnl === 'string') rawPnl = (rawPnl as string).replace(',', '.');
                const pnlValue = Number(rawPnl) || 0;
                managed.pnl = pnlValue;
                
                const volume = Number(pos.volume) || managed.initialVolume || 0.01;
                const baseTarget = typeof managed.forceClosePnL === 'number' ? managed.forceClosePnL : 0.50;
                const target = baseTarget * (volume / 0.01);
                const targetHit = target > 0 && pnlValue >= target;

                if (targetHit) {
                    console.log(`[MANAGEMENT] Target hit! Symbol: ${pos.symbol} Ticket: ${pos.ticket} PnL: ${pnlValue.toFixed(2)} Target: ${target}`);

                    const isCloseQueued = signalQueue.some(s => s.ticket == pos.ticket && s.action === 'CLOSE');
                    
                    if (!isCloseQueued) {
                        signalQueue.push({ action: 'CLOSE', ticket: Number(pos.ticket), symbol: pos.symbol, queuedAt: Date.now() });
                        console.log(`[EXECUTION] Sent FULL CLOSE for ${pos.symbol} ${pos.ticket}`);
                    }
                } else {
                    if (target > 0 && pnlValue >= (target * 0.8)) {
                        console.log(`[MANAGEMENT] Approaching Target. Symbol: ${pos.symbol} PnL: ${pnlValue.toFixed(2)} target: ${target}`);
                    }
                }
            });
        }
        res.json({ status: 'received' });
    } catch (e: any) {
        console.error("[MT5 STATE ERROR]:", e);
        res.status(500).json({ status: 'error', message: e.message });
    }
  });

  app.post(`${API_PREFIX}/mt5/error`, (req, res) => {
    const { id, error, message, asset } = req.body;
    console.log(`[MT5 ERROR] Signal ${id} failed: ${error} - ${message}`);
    // We can store this in a global array and expose it via an endpoint
    if (!(global as any).mt5Errors) (global as any).mt5Errors = [];
    (global as any).mt5Errors.push({ id, error, message, asset, timestamp: Date.now() });
    if ((global as any).mt5Errors.length > 100) (global as any).mt5Errors.shift();
    res.json({ status: 'recorded' });
  });

  app.get(`${API_PREFIX}/mt5/errors`, (req, res) => {
    res.json((global as any).mt5Errors || []);
    (global as any).mt5Errors = []; // clear after reading
  });

  app.post(`${API_PREFIX}/signals`, (req, res) => {
    const startTime = Date.now();
    console.log(`[SIGNALS] 📥 Received request at ${new Date(startTime).toISOString()}`);
    const data = req.body;
    
    if (data.action === 'ENTRY' || data.action_type === 'ENTRY' || data.action === 'HEDGE' || data.action_type === 'HEDGE') {
        let fClose = 0.50;
        if (typeof data.details?.forceClosePnL === 'number') fClose = data.details.forceClosePnL;
        else if (typeof data.forceClosePnL === 'number') fClose = data.forceClosePnL;

        latestSignalRules[data.symbol || data.asset] = {
            forceClosePnL: fClose
        };
    }
    
    // Only maintain forceClose extraction. Remove Hedge blocking and 5 minute cooldown as requested.
    const actionVal = data.action || data.action_type;
    
    const authHeader = req.headers['authorization'];
    if (authHeader !== `Bearer ${BRIDGE_SECRET}` && data.secret !== BRIDGE_SECRET) {
        console.log(`[SIGNALS] ❌ Unauthorized request`);
        return res.status(403).send('Unauthorized');
    }

    if (data.type === 'TELEGRAM') {
        relayToTelegram(data.botToken, data.chatId, data.text);
        console.log(`[SIGNALS] ✅ Telegram relayed in ${Date.now() - startTime}ms`);
        return res.json({ status: 'sent' });
    }

    if (data.id && processedIds.has(data.id)) {
        console.log(`[SIGNALS] ⚠️ Ignored duplicate in ${Date.now() - startTime}ms`);
        return res.json({ status: 'ignored_duplicate' });
    }

    if (signalQueue.length >= MAX_QUEUE_SIZE) {
        signalQueue.shift(); // Remove oldest
    }
    signalQueue.push({ ...data, queuedAt: Date.now() });
    if (data.id) processedIds.add(data.id);
    
    console.log(`[SIGNALS] ✅ Queued in ${Date.now() - startTime}ms. Queue length: ${signalQueue.length}`);
    res.json({ status: 'queued', queueLength: signalQueue.length });
  });


  // API Proxy Route for Market Data
  const proxyCache = new Map<string, { data: any, timestamp: number }>();
  const CACHE_TTL = 15000; // 15 seconds cache

  app.get("/api/proxy/market-data", async (req, res) => {
    try {
      const { endpoint, ...params } = req.query;
      if (!endpoint || typeof endpoint !== 'string') {
        return res.status(400).json({ error: "Missing or invalid endpoint" });
      }
      
      const queryString = new URLSearchParams(params as any).toString();
      const url = `https://www.deribit.com/api/v2/public/${endpoint}?${queryString}`;

      const cached = proxyCache.get(url);
      if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        console.log(`[Proxy Cache Hit] ${endpoint}`);
        return res.json(cached.data);
      }

      console.log("Proxying request to:", url);
      
      let retries = 0;
      let response;
      while (retries < 3) {
        try {
          response = await axios.get(url, { timeout: 8000 });
          break; // Success
        } catch (error: any) {
          const status = error.response?.status;
          if ((status === 502 || status === 503 || status === 504) && retries < 2) {
            retries++;
            console.warn(`[Proxy] ${status} received for ${endpoint}, retry ${retries}...`);
            await new Promise(r => setTimeout(r, 2000 * retries));
          } else {
            // If we have stale cached data, serve it instead of failing
            if (cached) {
              console.warn(`[Proxy] Request failed, serving stale cached data for ${endpoint}`);
              return res.json(cached.data);
            }
            throw error; // Re-throw if no cache and out of retries
          }
        }
      }
      
      proxyCache.set(url, { data: response?.data, timestamp: Date.now() });
      res.json(response?.data);
    } catch (error: any) {
      console.error("Proxy Error for endpoint", req.query.endpoint, ":", error.message);
      res.status(error.response?.status || 500).json({ error: "Failed to fetch from market data provider", details: error.message });
    }
  });

  // --- 404 Catcher for API ---
  app.use((req, res, next) => {
    if (req.originalUrl.startsWith('/api')) {
      console.log(`[404 NOT FOUND] ${req.method} ${req.originalUrl}`);
      res.status(404).json({ error: 'Not found', path: req.originalUrl });
    } else {
      next();
    }
  });

  // Vite middleware for development
  const isProduction = process.env.NODE_ENV === "production" || process.argv.some(arg => arg.includes('server.cjs'));
  if (!isProduction) {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.use((req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
