import { equityDataFeedService } from './src/services/EquityDataFeedService';
import { riskLimitsService } from './src/services/RiskLimitsService';
import { preTradeRiskGuard } from './src/services/PreTradeRiskGuard';
import { tradingControlService } from './src/services/TradingControlService';
import { diagnosticsService } from './src/services/DiagnosticsService';
import { coordinationTraceService } from "./src/services/CoordinationTraceService";
import { executionDecisionTraceService } from "./src/services/ExecutionDecisionTraceService";
import { executionSanityDiagnosticService } from "./src/services/ExecutionSanityDiagnosticService";
import { eventTaxonomyService } from './src/services/EventTaxonomyService';
import { hunterModeService } from './src/services/HunterModeService';
import { strategyBacktestAdapter } from './src/services/StrategyBacktestAdapter';
import { TradingRLAgent } from './src/services/rl/TradingRLAgent';
import { rlExecutionPolicyService } from './src/services/rl/RLExecutionPolicyService';
import express from "express";
import axios from "axios";
import cors from "cors";
import path from "path";
import https from 'https';
import * as crypto from 'crypto';
import { exec } from 'child_process';
import * as fs from 'fs';
import { WebSocketServer, WebSocket as WsSocket } from 'ws';
import { AppConfig, StrategyType } from './src/types';
import { getRuntimeConfig } from './src/server/runtimeConfig';

// Capture console.log for debugging backend
const originalConsoleLog = console.log;
const originalConsoleError = console.error;
const memLogs: string[] = [];
const auditTrailLogs: any[] = [];
const AUDIT_TRAIL_FILE = path.join(process.cwd(), 'audit-trail.log');
console.log = function(...args) {
    const safeArgs = args.map(a => typeof a === 'object' ? redactSensitiveData(a) : a);
    const msg = safeArgs.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' ');
    memLogs.push(`[${new Date().toISOString()}] LOG: ${msg}`);
    if (memLogs.length > 500) memLogs.shift();
    originalConsoleLog.apply(console, safeArgs);
};
console.error = function(...args) {
    const safeArgs = args.map(a => typeof a === 'object' ? redactSensitiveData(a) : a);
    const msg = safeArgs.map(a => typeof a === 'object' ? JSON.stringify(a, Object.getOwnPropertyNames(a)) : a).join(' ');
    memLogs.push(`[${new Date().toISOString()}] ERR: ${msg}`);
    if (memLogs.length > 500) memLogs.shift();
    originalConsoleError.apply(console, safeArgs);
};

// Bridge State
type OrderStatus = 'QUEUED' | 'DELIVERED_TO_MT5' | 'ACKNOWLEDGED' | 'FILLED' | 'FAILED' | 'EXPIRED' | 'REJECTED';
type QueuedSignal = Record<string, any> & { id: string; queuedAt: number };
type OrderRecord = {
    id: string;
    status: OrderStatus;
    createdAt: string;
    updatedAt: string;
    asset?: string;
    action?: string;
    reason?: string;
    ticket?: number;
};
let signalQueue: QueuedSignal[] = [];
const MAX_QUEUE_SIZE = 50;
const SIGNAL_EXPIRY_MS = 30000; // 30 seconds
let processedIds = new Set<string>();
let orderLedger = new Map<string, OrderRecord>();
let lastHeartbeat = Date.now();
const runtimeConfig = getRuntimeConfig();
const BRIDGE_SECRET = runtimeConfig.bridgeSecret;
const RUNTIME_MODE = runtimeConfig.mode;
const ALLOW_LIVE_RL = runtimeConfig.allowLiveRl;
const BRIDGE_DEV_MODE = runtimeConfig.bridgeDevMode;
const ENABLE_BRIDGE_WS = runtimeConfig.enableBridgeWs;
const ORDER_STATE_FILE = path.join(process.cwd(), 'order-queue.json');

const redactSensitiveData = (value: any): any => {
    if (!value || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.map(redactSensitiveData);
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [
        key,
        /secret|token|authorization|password/i.test(key) ? '[REDACTED]' : redactSensitiveData(item),
    ]));
};

// sanitizeDiagnosticsSnapshot moved to EventTaxonomyService.sanitizeSnapshot()

const DIAGNOSTICS_KEY = process.env.DIAGNOSTICS_KEY || '';

/**
 * Middleware to authorize diagnostics read access.
 * - Does NOT use BRIDGE_SECRET.
 * - Requires x-diagnostics-key header matching DIAGNOSTICS_KEY env var.
 * - NEVER bypasses auth — no dev-mode exceptions.
 * - In the future, replace x-diagnostics-key with user/session auth + diagnostics:read role/permission.
 * - The browser diagnostics UI must NOT send BRIDGE_SECRET or bridge Authorization credentials.
 */
const requireDiagnosticsRead = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const diagnosticsKey = req.headers['x-diagnostics-key'] as string | undefined;
    if (!diagnosticsKey || !DIAGNOSTICS_KEY || diagnosticsKey.trim() !== DIAGNOSTICS_KEY.trim()) {
        console.warn(`[DIAGNOSTICS AUTH] 401 on ${req.method} ${req.originalUrl} — missing or invalid x-diagnostics-key`);
        return res.status(401).json({
            error: 'DIAGNOSTICS_AUTH_FAILED',
            message: 'Valid x-diagnostics-key header is required to access diagnostics endpoints.',
        });
    }
    next();
};

const persistOrderState = () => {
    const tempFile = `${ORDER_STATE_FILE}.tmp`;
    fs.writeFileSync(tempFile, JSON.stringify({ signalQueue, processedIds: [...processedIds], orderLedger: [...orderLedger.values()] }), 'utf-8');
    fs.renameSync(tempFile, ORDER_STATE_FILE);
};

const loadOrderState = () => {
    try {
        if (!fs.existsSync(ORDER_STATE_FILE)) return;
        const state = JSON.parse(fs.readFileSync(ORDER_STATE_FILE, 'utf-8'));
        const now = Date.now();
        const persistedQueue = Array.isArray(state.signalQueue) ? state.signalQueue : [];
        const expiredIds = persistedQueue
            .filter((item: any) => item?.id && now - Number(item.queuedAt || 0) >= SIGNAL_EXPIRY_MS)
            .map((item: any) => String(item.id));
        signalQueue = persistedQueue.filter((item: any) => item?.id && now - Number(item.queuedAt || 0) < SIGNAL_EXPIRY_MS);
        processedIds = new Set(Array.isArray(state.processedIds) ? state.processedIds.slice(-5000) : []);
        orderLedger = new Map(
            (Array.isArray(state.orderLedger) ? state.orderLedger : [])
                .filter((record: any) => record?.id && record?.status)
                .slice(-5000)
                .map((record: OrderRecord) => [record.id, record])
        );
        for (const id of expiredIds) {
            const order = orderLedger.get(id);
            if (order?.status === 'QUEUED') {
                orderLedger.set(id, { ...order, status: 'EXPIRED', reason: 'Signal TTL elapsed while bridge was offline', updatedAt: new Date().toISOString() });
            }
        }
    } catch (error: any) {
        console.error('[ORDER QUEUE] Unable to restore persisted state:', error?.message || error);
    }
};

const appendOrderAudit = (record: OrderRecord) => {
    const auditEvent = { event: 'ORDER_STATUS', ...record };
    auditTrailLogs.push(auditEvent);
    if (auditTrailLogs.length > 5000) auditTrailLogs.shift();
    fs.appendFile(AUDIT_TRAIL_FILE, `${JSON.stringify(auditEvent)}\n`, (error) => {
        if (error) console.error('[ORDER AUDIT] Failed to append audit event:', error.message);
    });
};

const updateOrderStatus = (id: string, status: OrderStatus, details: Partial<OrderRecord> = {}) => {
    const current = orderLedger.get(id);
    if (!current) return;
    const record: OrderRecord = { ...current, ...details, status, updatedAt: new Date().toISOString() };
    orderLedger.set(id, record);
    appendOrderAudit(record);
    persistOrderState();
};

const pruneExpiredSignals = () => {
    const now = Date.now();
    const before = signalQueue.length;
    signalQueue = signalQueue.filter((signal) => {
        const expired = now - signal.queuedAt >= SIGNAL_EXPIRY_MS;
        if (expired) updateOrderStatus(signal.id, 'EXPIRED', { reason: 'Signal TTL elapsed before MT5 delivery' });
        return !expired;
    });
    if (signalQueue.length !== before) persistOrderState();
};

const enqueueSignal = (rawSignal: Record<string, any>) => {
    const id = String(rawSignal?.id || crypto.randomUUID());
    if (processedIds.has(id)) return { accepted: false, duplicate: true, id };
    pruneExpiredSignals();
    if (signalQueue.length >= MAX_QUEUE_SIZE) return { accepted: false, queueFull: true, id };
    const { secret: _secret, ...signal } = rawSignal || {};
    signalQueue.push({ ...signal, id, queuedAt: Date.now() });
    processedIds.add(id);
    const timestamp = new Date().toISOString();
    const record: OrderRecord = {
        id,
        status: 'QUEUED',
        createdAt: timestamp,
        updatedAt: timestamp,
        asset: String(signal.asset || signal.symbol || ''),
        action: String(signal.action || signal.action_type || ''),
    };
    orderLedger.set(id, record);
    appendOrderAudit(record);
    if (processedIds.size > 5000) processedIds = new Set([...processedIds].slice(-5000));
    persistOrderState();
    return { accepted: true, id };
};

const dequeueSignal = () => {
    pruneExpiredSignals();
    const signal = signalQueue.shift();
    if (signal) updateOrderStatus(signal.id, 'DELIVERED_TO_MT5');
    return signal;
};

const isAuthorized = (authorization: unknown): boolean => {
    if (!BRIDGE_SECRET) return false;
    const expected = `Bearer ${BRIDGE_SECRET}`;
    const provided = typeof authorization === 'string' ? authorization.trim() : '';
    if (provided.length === 0) return false;
    // Normalize whitespace for MQL5 WebRequest header quirks (extra \r\n, spaces, etc.)
    const normalizedProvided = provided.replace(/\s+/g, ' ');
    const normalizedExpected = expected.replace(/\s+/g, ' ');
    // Lengths MUST match before calling timingSafeEqual or it throws RangeError.
    const bufA = Buffer.from(normalizedProvided);
    const bufB = Buffer.from(normalizedExpected);
    if (bufA.length !== bufB.length) {
        // Log mismatch to help debug EA vs server secret configuration
        console.warn(
            `[AUTH LENGTH MISMATCH] provided length=${bufA.length} vs expected length=${bufB.length} — ` +
            `The EA WebhookSecret and server BRIDGE_SECRET must be identical!`
        );
        return false;
    }
    return crypto.timingSafeEqual(bufA, bufB);
};

/**
 * Unified bridge authentication validator.
 * Returns detailed info for logging: provided preview, expected prefix, and lengths.
 * Accepts both Authorization: Bearer and X-Bridge-Secret headers.
 */
function validateBridgeAuth(req: express.Request): { ok: boolean; provided?: string; expected?: string; providedLen?: number; expectedLen?: number } {
    const authHeader = req.headers['authorization'] as string | undefined;
    const bridgeHeader = req.headers['x-bridge-secret'] as string | undefined;
    const rawSecret = bridgeHeader || authHeader;
    const bearerValue = rawSecret?.startsWith('Bearer ') ? rawSecret : (rawSecret ? `Bearer ${rawSecret}` : '');
    const ok = isAuthorized(bearerValue);
    const expectedPrefix = `Bearer ${BRIDGE_SECRET?.substring(0, 8) || '?'}...`;
    const providedPreview = rawSecret ? rawSecret.substring(0, 20) + '...' : '(none)';
    return {
        ok,
        provided: providedPreview,
        expected: expectedPrefix,
        providedLen: rawSecret ? rawSecret.length : 0,
        expectedLen: `Bearer ${BRIDGE_SECRET}`.length,
    };
}

loadOrderState();

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
  const PORT = Number(process.env.PORT || 3000);
  const HOST = process.env.HOST || "127.0.0.1";
  const WS_PORT = Number(process.env.WS_PORT || 3001);

  // BRIDGE_SECRET is already validated in getRuntimeConfig() above.
  // If execution reaches here, bridgeSecret is guaranteed to be set.
  const allowedOrigins = runtimeConfig.allowedOrigins;
  app.use(cors({
    origin: allowedOrigins,
    methods: ['GET', 'POST', 'OPTIONS'],
    credentials: false
  }));
  app.use(express.json({ limit: '10mb' }));
  const requireBridgeAuth = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const authResult = validateBridgeAuth(req);
    if (!authResult.ok) {
      // BRIDGE_DEV_MODE: Allow UI-originated requests for settings/dashboard endpoints without auth.
      // MT5 bridge/mt5 paths still enforce auth so the EA WebhookSecret matters.
      if (BRIDGE_DEV_MODE) {
        const uiFriendlyPaths = [
          '/api/bridge/settings',
          '/api/bridge/state',
          '/api/bridge/managed-trades',
          '/api/bridge/orders',
          '/api/bridge/status',
        ];
        const isUiEndpoint = uiFriendlyPaths.some((p) => req.originalUrl.startsWith(p));
        if (isUiEndpoint) {
          console.log(`[AUTH DEV MODE] Bypassing auth for ${req.method} ${req.originalUrl}`);
          return next();
        }
      }
      console.warn(`[AUTH FAIL] 401 on ${req.method} ${req.originalUrl} | ` +
        `Sent: ${authResult.provided} (len=${authResult.providedLen}) | ` +
        `Expected starts with: ${authResult.expected} (len=${authResult.expectedLen})`);
      return res.status(401).json({
        error: 'BRIDGE_AUTH_FAILED',
        message: 'Invalid or missing bridge secret. Verify BRIDGE_SECRET on server matches WebhookSecret in MT5 EA input settings.',
        hint: 'Check EA input "WebhookSecret" and server .env "BRIDGE_SECRET" are identical. For MT5 WebRequest, use header: Authorization: Bearer <secret>',
        auth: {
          providedPreview: authResult.provided,
          expectedPrefix: authResult.expected,
          providedLength: authResult.providedLen,
          expectedLength: authResult.expectedLen,
        },
      });
    }
    next();
  };

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', mode: RUNTIME_MODE, timestamp: Date.now() });
  });
  // Unauthenticated diagnostic endpoint — MT5 can hit this to verify server reachability
  // Returns the exact auth header format needed for authenticated endpoints.
  app.get('/api/auth-test', (_req, res) => {
    const sampleSecret = BRIDGE_SECRET ? BRIDGE_SECRET.substring(0, 4) + '****' : '(not set)';
    res.json({
      status: 'server_reachable',
      bridgeSecretConfigured: Boolean(BRIDGE_SECRET),
      expectedAuthFormat: 'Authorization: Bearer <secret>',
      headerExample: `Authorization: Bearer ${sampleSecret}`,
      mql5HeadersExample: 'Content-Type: application/json\r\nAuthorization: Bearer <secret>\r\n',
      note: 'Replace <secret> with your actual BRIDGE_SECRET value. Must be identical in server .env AND MT5 EA WebhookSecret input.',
    });
  });
  app.get('/api/ready', (_req, res) => {
    const bridgeFresh = lastMT5SyncTime > 0 && Date.now() - lastMT5SyncTime < 15_000;
    res.status(RUNTIME_MODE === 'paper' || bridgeFresh ? 200 : 503).json({
      ready: RUNTIME_MODE === 'paper' || bridgeFresh,
      mode: RUNTIME_MODE,
      bridgeFresh,
    });
  });
  
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





// Diagnostics read endpoints — require x-diagnostics-key (not BRIDGE_SECRET).
  // The browser sends x-diagnostics-key from the frontend config, not Authorization/Bearer.
  app.get('/api/diagnostics/event-taxonomy-snapshot', requireDiagnosticsRead, (req, res) => {
      // getSnapshot() already applies sanitization via EventTaxonomyService.sanitizeSnapshot()
      const snapshot = eventTaxonomyService.getSnapshot();
      res.json(snapshot);
  });

  app.get('/api/diagnostics/risk-limits-snapshot', requireDiagnosticsRead, (req, res) => {
      res.json(riskLimitsService.getSnapshot());
  });

  app.get('/api/diagnostics/pretrade-snapshot', requireDiagnosticsRead, (req, res) => {
      res.json(preTradeRiskGuard.getSnapshot());
  });

  app.get('/api/diagnostics/control-snapshot', requireDiagnosticsRead, (req, res) => {
      res.json(tradingControlService.getSnapshot());
  });
  
  app.post('/api/diagnostics/control/kill-switch/on', requireBridgeAuth, (req, res) => {
      tradingControlService.setManualKillSwitch(true);
      res.json(tradingControlService.getSnapshot());
  });
  
  app.post('/api/diagnostics/control/kill-switch/off', requireBridgeAuth, (req, res) => {
      tradingControlService.setManualKillSwitch(false);
      res.json(tradingControlService.getSnapshot());
  });
  
  app.post('/api/diagnostics/control/reset', requireBridgeAuth, (req, res) => {
      tradingControlService.reset();
      res.json(tradingControlService.getSnapshot());
  });

app.get('/api/diagnostics/snapshot', requireDiagnosticsRead, (req, res) => {
      res.json(diagnosticsService.getSnapshot());
  });
  
    app.get('/api/diagnostics/execution-sanity', requireDiagnosticsRead, (req, res) => {
    const windowHours = parseInt(req.query.hours as string) || 24;
    const report = executionSanityDiagnosticService.generateDiagnosticReport(windowHours * 60 * 60 * 1000);
    res.json(report);
  });

  app.get('/api/diagnostics/execution-decision-trace', requireDiagnosticsRead, (req, res) => {
      res.json(executionDecisionTraceService.getLatestSnapshot() || {});
  });

    app.post('/api/diagnostics/audit-trail', requireBridgeAuth, (req, res) => {
      try {
        const decision = req.body;
        if (!decision || typeof decision !== 'object') {
          return res.status(400).json({ status: 'error', message: 'Invalid audit decision payload' });
        }

        const record = {
          ...decision,
          recordedAt: new Date().toISOString(),
        };

        auditTrailLogs.push(record);
        if (auditTrailLogs.length > 5000) {
          auditTrailLogs.shift();
        }

        fs.appendFile(AUDIT_TRAIL_FILE, `${JSON.stringify(record)}\n`, (err) => {
          if (err) {
            console.error('[AUDIT TRAIL] Failed to append audit record:', err.message);
          }
        });

        return res.json({ status: 'recorded' });
      } catch (e: any) {
        return res.status(500).json({ status: 'error', message: e?.message || 'Failed to record audit decision' });
      }
    });

    app.get('/api/diagnostics/audit-trail', (req, res) => {
      const limit = Math.max(1, Math.min(1000, Number(req.query.limit || 100)));
      res.json({ decisions: auditTrailLogs.slice(-limit) });
    });

    app.get('/api/diagnostics/hunter-mode', (req, res) => {
      res.json(hunterModeService.getSnapshot());
    });

    app.get('/api/diagnostics/hunter-mode/last-decisions', (req, res) => {
      const limit = Math.max(1, Math.min(100, Number(req.query.limit || 30)));
      res.json({ decisions: hunterModeService.getLastDecisions(limit) });
    });

    app.post('/api/diagnostics/hunter-mode/decision', requireBridgeAuth, (req, res) => {
      try {
        hunterModeService.ingestExternalDecision(req.body);
        res.json({ status: 'recorded' });
      } catch (e: any) {
        res.status(400).json({ status: 'error', message: e?.message || 'Invalid hunter decision payload' });
      }
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

  // Public read-only GET endpoints — no auth required for dashboard polling.
  app.get(`${API_PREFIX}/bridge/status`, (req, res) => {
    res.json({ 
        status: 'online', 
        version: '4.2', 
        queue_depth: signalQueue.length,
        lastMT5SyncTime
    });
  });

  app.get(`${API_PREFIX}/bridge/orders`, (req, res) => {
    const limit = Math.max(1, Math.min(1000, Number(req.query.limit || 100)));
    res.json({ orders: [...orderLedger.values()].slice(-limit) });
  });

  app.get(`${API_PREFIX}/bridge/orders/:id`, (req, res) => {
    const order = orderLedger.get(String(req.params.id));
    if (!order) return res.status(404).json({ error: 'Order not found' });
    res.json(order);
  });

  app.get('/api/diagnostics/execution-health', (req, res) => {
    const byStatus = [...orderLedger.values()].reduce<Record<string, number>>((counts, order) => {
      counts[order.status] = (counts[order.status] || 0) + 1;
      return counts;
    }, {});
    res.json({
      bridgeLastSyncAt: lastMT5SyncTime || null,
      bridgeConnected: lastMT5SyncTime > 0 && Date.now() - lastMT5SyncTime < 15_000,
      queueDepth: signalQueue.length,
      ordersByStatus: byStatus,
      risk: preTradeRiskGuard.getSnapshot(),
      control: tradingControlService.getSnapshot(),
      runtimeMode: RUNTIME_MODE,
      liveRlEnabled: RUNTIME_MODE === 'live' && ALLOW_LIVE_RL,
    });
  });

  app.post(`${API_PREFIX}/backtest/run`, requireBridgeAuth, async (req, res) => {
    try {
      const {
        strategyType,
        asset,
        data,
        initialCapital,
        startDate,
        endDate,
        config,
        execution,
      } = req.body || {};

      if (!strategyType || typeof strategyType !== 'string') {
        return res.status(400).json({ error: 'strategyType is required' });
      }
      if (!asset || typeof asset !== 'string') {
        return res.status(400).json({ error: 'asset is required' });
      }
      if (!Array.isArray(data) || data.length === 0) {
        return res.status(400).json({ error: 'data must be a non-empty OHLCV array' });
      }

      const parsedInitialCapital = Number(initialCapital);
      if (!Number.isFinite(parsedInitialCapital) || parsedInitialCapital <= 0) {
        return res.status(400).json({ error: 'initialCapital must be a positive number' });
      }

      const start = new Date(startDate);
      const end = new Date(endDate);
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
        return res.status(400).json({ error: 'startDate and endDate must be valid dates' });
      }

      const defaultConfig: Partial<AppConfig> = {
        minSignalScore: 0,
        hunterMode: false,
        riskRewardRatio: 2,
        fixedLotSizeBTC: 0.1,
        fixedLotSizeETH: 0.2,
        dvol: 50,
        hurst: 0.55,
        fisher: 1.5,
        rSquared: 0.4,
        toxicity: 0.7,
        slippage: 0.001,
        vwapZScore: 2,
        ofi: 0.2,
        volRatio: 1.5,
        strategyPerformance: {} as any,
        strategyGates: {} as any,
      };

      const mergedConfig = {
        ...defaultConfig,
        ...(config && typeof config === 'object' ? config : {}),
      } as AppConfig;

      const requestedExecution = execution && typeof execution === 'object' ? execution : {};
      const executionConfig = {
        spreadRate: Math.max(0, Number(requestedExecution.spreadRate ?? 0)),
        slippageRate: Math.max(0, Number(requestedExecution.slippageRate ?? mergedConfig.slippage ?? 0)),
        commissionRate: Math.max(0, Number(requestedExecution.commissionRate ?? mergedConfig.commissionRate ?? 0)),
        maxParticipationRate: Math.min(1, Math.max(0.000001, Number(requestedExecution.maxParticipationRate ?? 0.1))),
      };

      const result = await strategyBacktestAdapter.runStrategyBacktest(
        strategyType as StrategyType,
        asset,
        data,
        mergedConfig,
        parsedInitialCapital,
        start,
        end,
        executionConfig
      );

      return res.json({
        strategyType,
        asset,
        candles: data.length,
        execution: executionConfig,
        result,
      });
    } catch (e: any) {
      console.error('[BACKTEST] Failed to run backtest:', e?.message || e);
      return res.status(500).json({ error: e?.message || 'Failed to run backtest' });
    }
  });

  app.post(`${API_PREFIX}/rl/train`, requireBridgeAuth, async (req, res) => {
    try {
      const {
        data,
        episodes,
        stateSpace,
        actionSpace,
        learningRate,
      } = req.body || {};

      if (!Array.isArray(data) || data.length < 30) {
        return res.status(400).json({ error: 'data must be an OHLCV array with at least 30 candles' });
      }

      const parsedEpisodes = Math.max(1, Math.min(50000, Number(episodes ?? 1000)));
      const parsedStateSpace = Math.max(5, Math.min(200, Number(stateSpace ?? 50)));
      const parsedActionSpace = Math.max(3, Math.min(10, Number(actionSpace ?? 5)));
      const parsedLearningRate = Number(learningRate ?? 3e-4);

      if (!Number.isFinite(parsedLearningRate) || parsedLearningRate <= 0) {
        return res.status(400).json({ error: 'learningRate must be a positive number' });
      }

      const rlAgent = new TradingRLAgent({
        data,
        stateSpace: parsedStateSpace,
        actionSpace: parsedActionSpace,
        learningRate: parsedLearningRate,
      });

      const summaries = rlAgent.train(parsedEpisodes);
      const snapshot = rlAgent.getTrainingSnapshot();
      const last = summaries[summaries.length - 1] || null;

      return res.json({
        episodes: parsedEpisodes,
        stateSpace: parsedStateSpace,
        actionSpace: parsedActionSpace,
        learningRate: parsedLearningRate,
        finalEpisode: last,
        summaries: snapshot.summaries,
        policy: snapshot.policy,
      });
    } catch (e: any) {
      console.error('[RL] Failed to train agent:', e?.message || e);
      return res.status(500).json({ error: e?.message || 'Failed to train RL agent' });
    }
  });

  app.post(`${API_PREFIX}/rl/policy`, requireBridgeAuth, (req, res) => {
    try {
      const { policy, enabled } = req.body || {};
      const effectiveEnabled = enabled !== false && (RUNTIME_MODE !== 'live' || ALLOW_LIVE_RL);
      rlExecutionPolicyService.updateFromTraining(policy, effectiveEnabled);
      res.json({ ...rlExecutionPolicyService.getSnapshot(), runtimeMode: RUNTIME_MODE, liveExecutionAllowed: ALLOW_LIVE_RL });
    } catch (e: any) {
      return res.status(500).json({ error: e?.message || 'Failed to update RL policy' });
    }
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

  app.all(`${API_PREFIX}/mt5/signals`, requireBridgeAuth, (req, res) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    // Remove expired signals
    const now = Date.now();
    pruneExpiredSignals();
    
    if (signalQueue.length > 0) {
        console.log(`[MT5 SIGNALS] MT5 is checking for signals. Queue length: ${signalQueue.length}`);
    }
    
    const nextSignal = dequeueSignal();
    if (nextSignal) {
        console.log(`[BRIDGE] 📤 SENT TO MT5: ${nextSignal.asset || nextSignal.symbol || 'Unknown'} | Action: ${nextSignal.action} | Ticket: ${nextSignal.ticket}`);
    }
    res.json(nextSignal || {});
  });

  // Lightweight market data subscription provider for WebSocket clients.
  const marketDataProvider = (() => {
    const listenersBySymbol = new Map<string, Set<(data: any) => void>>();
    const lastSerializedBySymbol = new Map<string, string>();
    const pollersBySymbol = new Map<string, NodeJS.Timeout>();
    const POLL_INTERVAL_MS = 2000;

    const notify = (symbol: string, payload: any) => {
      const listeners = listenersBySymbol.get(symbol);
      if (!listeners || listeners.size === 0) return;
      for (const cb of listeners) {
        try {
          cb(payload);
        } catch (e: any) {
          console.error(`[WS] Listener failure for ${symbol}:`, e?.message || e);
        }
      }
    };

    const pollSymbol = async (symbol: string) => {
      try {
        let payload: any;
        if (symbol === 'XAUUSD' || symbol === 'XAUUSDT' || symbol === 'GOLD') {
          // Prefer the live MT5 EA-fed quote (real broker price) over the Binance proxy.
          const eaQuote = crlState?.marketQuotes?.['XAUUSD'] ?? crlState?.marketQuotes?.['GOLD'];
          const eaQuoteAgeMs = eaQuote ? Date.now() - Number(eaQuote.timestamp || 0) : Infinity;
          if (eaQuote && Number.isFinite(eaQuote.last) && eaQuote.last > 0 && eaQuoteAgeMs < 60_000) {
            payload = {
              symbol,
              instrument_name: symbol,
              last: Number(eaQuote.last),
              last_price: Number(eaQuote.last),
              price: Number(eaQuote.last),
              bid: eaQuote.bid,
              ask: eaQuote.ask,
              timestamp: Date.now(),
              source: 'MT5_EA',
            };
          } else {
            // FALLBACK: Binance XAUUSDT used as gold proxy when no fresh EA quote is available yet.
            // Differs from MT5 spot price — used only until the EA reports a fresh market_quotes entry.
            const binanceSymbol = 'XAUUSDT';
            // Binance Futures (fapi) supports XAUUSDT; Spot (api.binance.com) returns -1121 Invalid symbol.
            const binanceUrl = `https://fapi.binance.com/fapi/v1/ticker/price?symbol=${binanceSymbol}`;
            const response = await axios.get(binanceUrl, { timeout: 6000 });
            // Normalize Binance response to match expected shape: { last, symbol, ... }
            payload = {
              symbol,
              instrument_name: symbol,
              last: Number(response.data?.price ?? 0),
              last_price: Number(response.data?.price ?? 0),
              price: Number(response.data?.price ?? 0),
              timestamp: Date.now(),
              source: 'BINANCE_PROXY',
            };
          }
        } else {
          const url = `https://www.deribit.com/api/v2/public/ticker?instrument_name=${encodeURIComponent(symbol)}`;
          const response = await axios.get(url, { timeout: 6000 });
          payload = response.data?.result ?? response.data;
        }
        const serialized = JSON.stringify(payload);

        if (lastSerializedBySymbol.get(symbol) !== serialized) {
          lastSerializedBySymbol.set(symbol, serialized);
          notify(symbol, payload);
        }
      } catch (e: any) {
        console.error(`[WS] Market data poll error for ${symbol}:`, e?.message || e);
      }
    };

    const ensurePoller = (symbol: string) => {
      if (pollersBySymbol.has(symbol)) return;
      void pollSymbol(symbol);
      const timer = setInterval(() => {
        void pollSymbol(symbol);
      }, POLL_INTERVAL_MS);
      pollersBySymbol.set(symbol, timer);
    };

    const stopPollerIfUnused = (symbol: string) => {
      const listeners = listenersBySymbol.get(symbol);
      if (listeners && listeners.size > 0) return;
      const timer = pollersBySymbol.get(symbol);
      if (timer) {
        clearInterval(timer);
        pollersBySymbol.delete(symbol);
      }
      listenersBySymbol.delete(symbol);
      lastSerializedBySymbol.delete(symbol);
    };

    return {
      subscribe(symbol: string, listener: (data: any) => void) {
        const normalized = String(symbol || '').trim().toUpperCase();
        if (!normalized) {
          throw new Error('Invalid symbol for market data subscription');
        }

        let listeners = listenersBySymbol.get(normalized);
        if (!listeners) {
          listeners = new Set();
          listenersBySymbol.set(normalized, listeners);
        }

        listeners.add(listener);
        ensurePoller(normalized);

        return () => {
          const current = listenersBySymbol.get(normalized);
          if (current) {
            current.delete(listener);
          }
          stopPollerIfUnused(normalized);
        };
      },
    };
  })();

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
            const sig = dequeueSignal()!;
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

  // Public GET — dashboard reads bridge settings without auth.
  app.get(`${API_PREFIX}/bridge/settings`, (req, res) => {
    res.json(globalBridgeSettings);
  });

  app.post(`${API_PREFIX}/bridge/settings`, requireBridgeAuth, (req, res) => {
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

  // Safe UI endpoint for non-sensitive bridge settings (no bridge auth required)
  app.post(`${API_PREFIX}/bridge/ui-settings`, (req, res) => {
    // Only accept non-sensitive fields
    const { forceClosePnL, enableTelegramAlerts } = req.body || {};
    if (forceClosePnL !== undefined && typeof forceClosePnL === 'number') {
      globalBridgeSettings.forceClosePnL = forceClosePnL;
    }
    if (enableTelegramAlerts !== undefined && typeof enableTelegramAlerts === 'boolean') {
      globalBridgeSettings.enableTelegramAlerts = enableTelegramAlerts;
    }
    // Propagate to active trades
    if (typeof globalBridgeSettings.forceClosePnL === 'number') {
      for (const ticket in activeManagedTrades) {
        activeManagedTrades[ticket].forceClosePnL = globalBridgeSettings.forceClosePnL;
      }
    }
    try {
      fs.writeFileSync(SETTINGS_FILE, JSON.stringify(globalBridgeSettings, null, 2), "utf-8");
    } catch (err) {
      console.error("❌ Failed to write settings.json from UI endpoint", err);
    }
    res.json({ success: true, settings: { forceClosePnL: globalBridgeSettings.forceClosePnL, enableTelegramAlerts: globalBridgeSettings.enableTelegramAlerts } });
  });
  
  // Public GET — dashboard polls these without auth.
  app.get(`${API_PREFIX}/bridge/managed-trades`, (req, res) => {
    res.json({ trades: Object.values(activeManagedTrades), crlState });
  });

  app.get(`${API_PREFIX}/bridge/state`, (req, res) => {
    res.json({ closedTrades, crlState });
  });

  const parseIncomingTimestampMs = (raw: any): number => {
    if (raw === undefined || raw === null) return Date.now();
    if (typeof raw === 'number' && Number.isFinite(raw)) {
      return raw > 1e12 ? raw : raw * 1000;
    }
    if (typeof raw === 'string') {
      const numeric = Number(raw);
      if (Number.isFinite(numeric)) {
        return numeric > 1e12 ? numeric : numeric * 1000;
      }
      const parsed = Date.parse(raw);
      return Number.isNaN(parsed) ? Date.now() : parsed;
    }
    return Date.now();
  };

  const normalizeIncomingQuotes = (source: any): Record<string, any> => {
    const out: Record<string, any> = {};
    if (!source) return out;

    const upsert = (symbolRaw: any, quote: any) => {
      const symbol = String(symbolRaw || quote?.symbol || quote?.asset || '').toUpperCase();
      if (!symbol) return;
      const last = Number(quote?.last ?? quote?.price ?? quote?.close ?? 0);
      const bid = Number(quote?.bid ?? 0);
      const ask = Number(quote?.ask ?? 0);
      const resolvedLast = Number.isFinite(last) && last > 0
        ? last
        : (Number.isFinite(bid) && Number.isFinite(ask) && bid > 0 && ask > 0 ? (bid + ask) / 2 : 0);

      if (!Number.isFinite(resolvedLast) || resolvedLast <= 0) return;

      out[symbol] = {
        last: resolvedLast,
        bid: Number.isFinite(bid) && bid > 0 ? bid : undefined,
        ask: Number.isFinite(ask) && ask > 0 ? ask : undefined,
        timestamp: parseIncomingTimestampMs(quote?.timestamp ?? quote?.ts ?? quote?.time ?? quote?.updatedAt),
      };
    };

    if (Array.isArray(source)) {
      for (const row of source) {
        upsert(row?.symbol || row?.asset || row?.instrument, row || {});
      }
      return out;
    }

    if (typeof source === 'object') {
      for (const [symbol, quote] of Object.entries(source)) {
        upsert(symbol, quote || {});
      }
    }

    return out;
  };

  const evaluateBridgeOrder = (data: Record<string, any>) => {
    const action = String(data.action || data.action_type || '').toUpperCase();
    const isRiskReducing = ['CLOSE', 'EXIT', 'REDUCE'].includes(action);
    if (isRiskReducing) return { allowed: true, isRiskReducing };
    if (!['ENTRY', 'HEDGE', 'FLIP'].includes(action)) {
      return { allowed: false, reason: `Unsupported order action: ${action || 'missing'}`, decisionCode: 'BLOCKED_INVALID_ACTION' };
    }

    const symbol = String(data.symbol || data.asset || '').trim().toUpperCase();
    const size = Number(data.fixedLotSize ?? data.size ?? data.recommendedSize ?? data.volume);
    const requestedPrice = Number(data.entry ?? data.price ?? data.currentPrice);
    const quote = crlState?.marketQuotes?.[symbol];
    const referencePrice = Number(data.referencePrice ?? quote?.last ?? quote?.price ?? requestedPrice);
    const quoteTimestamp = Number(quote?.timestamp ?? crlState?.marketQuotesUpdatedAt ?? 0);

    if (!symbol || !Number.isFinite(size) || size <= 0 || !Number.isFinite(requestedPrice) || requestedPrice <= 0) {
      return { allowed: false, reason: 'Risk-increasing orders require symbol, positive size, and a current price', decisionCode: 'BLOCKED_INVALID_ORDER' };
    }

    const decision = preTradeRiskGuard.evaluate({
      symbol,
      side: String(data.direction || data.side || action),
      size,
      notional: size * requestedPrice,
      price: requestedPrice,
      referencePrice,
      timestamp: Date.now(),
      isRiskReducing,
    }, { lastMarketDataTs: Number.isFinite(quoteTimestamp) && quoteTimestamp > 0 ? quoteTimestamp : null });

    return { ...decision, isRiskReducing };
  };

  // ✅ BRILLIANT SOLUTION: COMBINED ENDPOINT TO SAVE MT5 API REQUESTS
  // This endpoint accepts the state AND returns pending signals in the SAME response.
  // Instead of 2 requests every 3 seconds, MT5 only needs 1 request every 3 seconds.
  // 50% CPU and bandwidth cost savings.
  app.post(`${API_PREFIX}/mt5/sync`, requireBridgeAuth, (req, res) => {
    try {
        lastMT5SyncTime = Date.now();
        const {
          positions,
          crl_baseline,
          crl_current,
          crl_diff,
          crl_budget,
          crl_threshold,
          equity,
          margin,
          market_quotes,
          quotes,
          symbol_prices,
          prices,
          market_data,
          ticks
        } = req.body;

        const normalizedQuotes = normalizeIncomingQuotes(
          market_quotes || quotes || symbol_prices || prices || market_data || ticks
        );
        
        if (crl_baseline !== undefined) {
             // Preserve accumulated per-symbol quotes across resets — each EA instance only reports its own chart symbol.
             const prevMarketQuotes = crlState?.marketQuotes;
             const prevMarketQuotesUpdatedAt = crlState?.marketQuotesUpdatedAt;
             crlState = {
                  baseline: Number(crl_baseline),
                  current: Number(crl_current),
                  diff: Number(crl_diff),
                  budget: Number(crl_budget),
                  threshold: Number(crl_threshold),
                 equity: equity !== undefined ? Number(equity) : undefined,
                 margin: margin !== undefined ? Number(margin) : undefined,
                 marketQuotes: prevMarketQuotes,
                 marketQuotesUpdatedAt: prevMarketQuotesUpdatedAt,
             };
        }

        if (!crlState || typeof crlState !== 'object') {
            crlState = {};
        }
        if (Object.keys(normalizedQuotes).length > 0) {
            crlState.marketQuotes = { ...(crlState.marketQuotes || {}), ...normalizedQuotes };
            crlState.marketQuotesUpdatedAt = Date.now();
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
                        enqueueSignal({ action: 'CLOSE', ticket: Number(pos.ticket), symbol: pos.symbol });
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
        pruneExpiredSignals();
        const nextSignal = dequeueSignal();
        if (nextSignal) {
            console.log(`[SYNC BRIDGE] 📤 SENT TO MT5 via Sync: ${nextSignal.asset || nextSignal.symbol || 'Unknown'} | Action: ${nextSignal.action} | Ticket: ${nextSignal.ticket}`);
        }
        
        res.json(nextSignal || { status: "received", commands: [] });
    } catch (e: any) {
        console.error("[MT5 SYNC ERROR]:", e);
        res.status(500).json({ status: 'error', message: e.message });
    }
  });

  app.post(`${API_PREFIX}/mt5/state`, requireBridgeAuth, (req, res) => {
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
                        enqueueSignal({ action: 'CLOSE', ticket: Number(pos.ticket), symbol: pos.symbol });
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

  app.post(`${API_PREFIX}/mt5/error`, requireBridgeAuth, (req, res) => {
    const { id, error, message, asset } = req.body;
    console.log(`[MT5 ERROR] Signal ${id} failed: ${error} - ${message}`);
    // We can store this in a global array and expose it via an endpoint
    if (!(global as any).mt5Errors) (global as any).mt5Errors = [];
    (global as any).mt5Errors.push({ id, error, message, asset, timestamp: Date.now() });
    if ((global as any).mt5Errors.length > 100) (global as any).mt5Errors.shift();
    if (id && orderLedger.has(String(id))) {
      updateOrderStatus(String(id), 'FAILED', { reason: String(message || error || 'MT5 execution failed') });
    }
    res.json({ status: 'recorded' });
  });

  app.post(`${API_PREFIX}/mt5/order-status`, requireBridgeAuth, (req, res) => {
    const id = String(req.body?.id || '');
    const status = String(req.body?.status || '').toUpperCase() as OrderStatus;
    const allowedStatuses: OrderStatus[] = ['ACKNOWLEDGED', 'FILLED', 'FAILED'];
    if (!id || !allowedStatuses.includes(status) || !orderLedger.has(id)) {
      return res.status(400).json({ error: 'Known order id and valid status are required' });
    }
    updateOrderStatus(id, status, {
      reason: typeof req.body?.reason === 'string' ? req.body.reason : undefined,
      ticket: Number.isFinite(Number(req.body?.ticket)) ? Number(req.body.ticket) : undefined,
    });
    res.json({ status: 'recorded', order: orderLedger.get(id) });
  });

  // Public GET — dashboard polls this to display MT5 errors.
  app.get(`${API_PREFIX}/mt5/errors`, (req, res) => {
    res.json((global as any).mt5Errors || []);
    (global as any).mt5Errors = []; // clear after reading
  });

  app.post(`${API_PREFIX}/signals`, requireBridgeAuth, (req, res) => {
    const startTime = Date.now();
    console.log(`[SIGNALS] 📥 Received request at ${new Date(startTime).toISOString()}`);
    const data = req.body;

    if (!data || typeof data !== 'object') {
        return res.status(400).json({ error: 'A JSON signal payload is required' });
    }
    if (data.type !== 'TELEGRAM') {
      const riskDecision = evaluateBridgeOrder(data);
      if (!riskDecision.allowed) {
        const id = String(data.id || crypto.randomUUID());
        const timestamp = new Date().toISOString();
        const record: OrderRecord = {
          id,
          status: 'REJECTED',
          createdAt: timestamp,
          updatedAt: timestamp,
          asset: String(data.asset || data.symbol || ''),
          action: String(data.action || data.action_type || ''),
          reason: riskDecision.reason || riskDecision.decisionCode,
        };
        orderLedger.set(id, record);
        processedIds.add(id);
        appendOrderAudit(record);
        persistOrderState();
        return res.status(422).json({ status: 'rejected', id, reason: record.reason, decisionCode: riskDecision.decisionCode });
      }
    }
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
    
    if (data.type === 'TELEGRAM') {
        relayToTelegram(data.botToken, data.chatId, data.text);
        console.log(`[SIGNALS] ✅ Telegram relayed in ${Date.now() - startTime}ms`);
        return res.json({ status: 'sent' });
    }

    const queued = enqueueSignal(data);
    if (queued.duplicate) {
        console.log(`[SIGNALS] ⚠️ Ignored duplicate in ${Date.now() - startTime}ms`);
        return res.json({ status: 'ignored_duplicate', id: queued.id });
    }
    if (queued.queueFull) {
        return res.status(429).json({ status: 'rejected', reason: 'QUEUE_FULL', id: queued.id });
    }
    
    console.log(`[SIGNALS] ✅ Queued in ${Date.now() - startTime}ms. Queue length: ${signalQueue.length}`);
    res.status(202).json({ status: 'queued', id: queued.id, queueLength: signalQueue.length });
  });

  // UI-safe signal endpoint — no bridge auth, for browser-generated signals only
  app.post(`${API_PREFIX}/signals/ui`, (req, res) => {
    const startTime = Date.now();
    console.log(`[SIGNALS/UI] 📥 Received UI signal at ${new Date(startTime).toISOString()}`);
    const data = req.body;

    if (!data || typeof data !== 'object') {
        return res.status(400).json({ error: 'A JSON signal payload is required' });
    }

    // Apply same validation/evaluation as the bridge endpoint
    if (data.type !== 'TELEGRAM') {
      const riskDecision = evaluateBridgeOrder(data);
      if (!riskDecision.allowed) {
        const id = String(data.id || crypto.randomUUID());
        const timestamp = new Date().toISOString();
        const record: OrderRecord = {
          id,
          status: 'REJECTED',
          createdAt: timestamp,
          updatedAt: timestamp,
          asset: String(data.asset || data.symbol || ''),
          action: String(data.action || data.action_type || ''),
          reason: riskDecision.reason || riskDecision.decisionCode,
        };
        orderLedger.set(id, record);
        processedIds.add(id);
        appendOrderAudit(record);
        persistOrderState();
        return res.status(422).json({ status: 'rejected', id, reason: record.reason, decisionCode: riskDecision.decisionCode });
      }
    }

    if (data.action === 'ENTRY' || data.action_type === 'ENTRY' || data.action === 'HEDGE' || data.action_type === 'HEDGE') {
        let fClose = 0.50;
        if (typeof data.details?.forceClosePnL === 'number') fClose = data.details.forceClosePnL;
        else if (typeof data.forceClosePnL === 'number') fClose = data.forceClosePnL;
        latestSignalRules[data.symbol || data.asset] = { forceClosePnL: fClose };
    }

    if (data.type === 'TELEGRAM') {
        relayToTelegram(data.botToken, data.chatId, data.text);
        console.log(`[SIGNALS/UI] ✅ Telegram relayed in ${Date.now() - startTime}ms`);
        return res.json({ status: 'sent' });
    }

    const queued = enqueueSignal(data);
    if (queued.duplicate) {
        console.log(`[SIGNALS/UI] ⚠️ Ignored duplicate in ${Date.now() - startTime}ms`);
        return res.json({ status: 'ignored_duplicate', id: queued.id });
    }
    if (queued.queueFull) {
        return res.status(429).json({ status: 'rejected', reason: 'QUEUE_FULL', id: queued.id });
    }

    console.log(`[SIGNALS/UI] ✅ Queued in ${Date.now() - startTime}ms. Queue length: ${signalQueue.length}`);
    res.status(202).json({ status: 'queued', id: queued.id, queueLength: signalQueue.length });
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

// Start Equity Data Feed Service — feeds all risk layers with real data
  equityDataFeedService.configureDefaults();
  equityDataFeedService.start(() => {
    const bridgeState: any = {
      equity: crlState?.equity ?? crlState?.baseline ?? null,
      baseline: crlState?.baseline ?? null,
      diff: crlState?.diff ?? null,
      budget: crlState?.budget ?? null,
      marketQuotes: crlState?.marketQuotes ?? null,
    };
    return bridgeState;
  }, 60000);
  console.log('[EQUITY FEED] EquityDataFeedService started — feeding DrawdownFloor, VolTarget, TailRisk with live data');

  // ──────────────────────────────────────────────
  // WebSocket Server (port 3001) — Market Data & Bridge State
  // ──────────────────────────────────────────────
  const wss = new WebSocketServer({ port: WS_PORT, host: HOST });
  wss.on('connection', (ws: WsSocket, req) => {
    const clientIp = req.socket.remoteAddress || 'unknown';
    console.log(`[WS] Client connected from ${clientIp}`);

    // Subscribe the client to market data for symbols they request
    const subscriptions = new Set<string>();
    let lastSendTime = 0;
    let msgCount = 0;

    // Rate limit: max 50 messages per second
    const rateLimitOk = (): boolean => {
      const now = Date.now();
      if (now - lastSendTime > 1000) {
        msgCount = 0;
        lastSendTime = now;
      }
      msgCount++;
      if (msgCount > 50) {
        console.warn(`[WS] Rate limit exceeded for ${clientIp}, closing`);
        ws.close(1008, 'Rate limit exceeded');
        return false;
      }
      return true;
    };

    ws.on('message', (raw: Buffer) => {
      if (!rateLimitOk()) return;
      try {
        if (raw.length > 1024) {
          console.warn(`[WS] Oversized message (${raw.length} bytes) from ${clientIp}, closing`);
          ws.close(1009, 'Message too large');
          return;
        }
        const msg = JSON.parse(raw.toString('utf-8'));
        if (!msg || typeof msg !== 'object' || !msg.type) {
          ws.send(JSON.stringify({ type: 'ERROR', message: 'Invalid message shape' }));
          return;
        }

        if (msg.type === 'SUBSCRIBE_MARKET_DATA') {
          const symbol = String(msg.payload?.symbol || '').trim().toUpperCase();
          if (!symbol) {
            ws.send(JSON.stringify({ type: 'ERROR', message: 'symbol required' }));
            return;
          }
          subscriptions.add(symbol);
          // Add a listener to the marketDataProvider
          const unsub = marketDataProvider.subscribe(symbol, (data: any) => {
            if (ws.readyState === WsSocket.OPEN) {
              ws.send(JSON.stringify({
                type: 'MARKET_UPDATE',
                data: {
                  symbol,
                  ...data,
                },
              }));
            }
          });
          ws.send(JSON.stringify({ type: 'SUBSCRIBED', symbol }));
        } else if (msg.type === 'UNSUBSCRIBE_MARKET_DATA') {
          const symbol = String(msg.payload?.symbol || '').trim().toUpperCase();
          if (symbol) {
            subscriptions.delete(symbol);
          }
          ws.send(JSON.stringify({ type: 'UNSUBSCRIBED', symbol }));
        } else if (msg.type === 'SUBSCRIBE_BRIDGE_STATE') {
          // Push non-secret bridge state periodically
          const bridgeStateInterval = setInterval(() => {
            if (ws.readyState !== WsSocket.OPEN) {
              clearInterval(bridgeStateInterval);
              return;
            }
            ws.send(JSON.stringify({
              type: 'BRIDGE_STATE',
              data: {
                queueDepth: signalQueue.length,
                activeTrades: Object.keys(activeManagedTrades).length,
                lastSyncTime: lastMT5SyncTime,
                online: lastMT5SyncTime > 0 && Date.now() - lastMT5SyncTime < 30_000,
              },
            }));
          }, 5000);
          ws.on('close', () => clearInterval(bridgeStateInterval));
          ws.send(JSON.stringify({ type: 'BRIDGE_STATE_SUBSCRIBED' }));
        } else {
          ws.send(JSON.stringify({ type: 'ERROR', message: `Unknown message type: ${msg.type}` }));
        }
      } catch (e: any) {
        ws.send(JSON.stringify({ type: 'ERROR', message: 'Failed to parse message' }));
      }
    });

    ws.on('close', () => {
      console.log(`[WS] Client disconnected from ${clientIp}`);
    });

    ws.on('error', (err) => {
      console.error(`[WS] Error for ${clientIp}:`, err.message);
    });
  });

  console.log(`[WS] WebSocket server listening on ws://${HOST}:${WS_PORT}`);

  app.listen(PORT, HOST, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
