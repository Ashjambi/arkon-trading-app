export type RuntimeMode = 'paper' | 'live';

export interface RuntimeConfig {
  bridgeSecret: string;
  mode: RuntimeMode;
  allowLiveRl: boolean;
  allowedOrigins: string[];
  bridgeDevMode: boolean;
  enableBridgeWs: boolean;
}

/**
 * Construct a clear, actionable error message when BRIDGE_SECRET is missing.
 */
export function buildBridgeSecretError(): Error {
  const lines = [
    '═══════════════════════════════════════════════════════════════',
    '  ❌ MISSING REQUIRED ENVIRONMENT VARIABLE: BRIDGE_SECRET',
    '═══════════════════════════════════════════════════════════════',
    '',
    '  The ARKON trading bridge requires BRIDGE_SECRET for secure',
    '  authentication between the server and MT5 terminal.',
    '',
    '  ┌─ How to fix ──────────────────────────────────────────┐',
    '  │                                                       │',
    '  │  1. Copy the example env file:                        │',
    '  │     cp .env.example .env                              │',
    '  │                                                       │',
    '  │  2. Edit .env and set a strong random secret:         │',
    '  │     BRIDGE_SECRET="your_strong_random_secret_here"    │',
    '  │                                                       │',
    '  │  3. Restart the server                                │',
    '  │                                                       │',
    '  │  💡 Generate a secret: openssl rand -hex 32           │',
    '  │                                                       │',
    '  └───────────────────────────────────────────────────────┘',
    '',
    '  📖 See .env.example for all available options.',
    '',
    '═══════════════════════════════════════════════════════════════',
  ];

  return new Error(lines.join('\n'));
}

/**
 * Centralizes server-only environment parsing so live-mode defaults stay fail-safe.
 * 
 * Reads environment variables. For .env file support in development:
 *   - If using `tsx` (npm run dev): tsx v4+ auto-loads .env
 *   - If using `node dist/server.cjs` (npm start): create .env and Node will
 *     read it if you pass --env-file (Node 20.18+):
 *       node --env-file=.env dist/server.cjs
 *   - Alternatively, set BRIDGE_SECRET in your shell profile or launch script.
 */
export const getRuntimeConfig = (env: NodeJS.ProcessEnv = process.env): RuntimeConfig => {
  const bridgeDevMode = env.BRIDGE_DEV_MODE === 'true';
  const bridgeSecret = env.BRIDGE_SECRET || '';

  if (!bridgeSecret || bridgeSecret.trim().length === 0) {
    throw buildBridgeSecretError();
  }

// Safe startup diagnostics — never log the secret itself, prefix, or hash
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  🔐 BRIDGE SECURITY STATUS');
  console.log(`  bridgeSecretConfigured: ${bridgeSecret.trim().length > 0}`);
  console.log(`  bridgeSecretLength: ${bridgeSecret.length} characters`);
  console.log(`  bridgeDevMode: ${bridgeDevMode}`);
  console.log(`  runtimeMode: ${env.RUNTIME_MODE || 'paper'}`);
  console.log('═══════════════════════════════════════════════════════════════');

  return {
    bridgeSecret,
    mode: env.RUNTIME_MODE === 'live' ? 'live' : 'paper',
    allowLiveRl: env.ALLOW_LIVE_RL === 'true',
    allowedOrigins: (env.CORS_ALLOWED_ORIGINS || 'http://127.0.0.1:3000,http://localhost:3000')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
    bridgeDevMode,
    enableBridgeWs: env.ENABLE_BRIDGE_WS === 'true',
  };
};
