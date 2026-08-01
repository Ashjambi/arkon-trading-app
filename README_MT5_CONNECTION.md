# MT5 Connection Guide

The MetaTrader 5 Expert Advisor uses `WebRequest` to send and receive data.

## Important Note for AI Studio

If you are running this app inside the **Google AI Studio Preview Environment** (the URL ends with `run.app` and starts with `ais-dev` or `ais-pre`), **MetaTrader 5 cannot connect to it directly**.

### Why?
AI Studio protects preview URLs with a security layer that requires browser cookies and JavaScript execution (it returns a `302 Redirect` to `__cookie_check.html`). Since MT5 `WebRequest` is not a browser and cannot run JavaScript, the connection fails (often resulting in custom proxy errors or HTTP codes like `1003`).

### How to Fix This

To allow MT5 to connect to the trading engine, you must run the server in an environment without this browser-check proxy. You have two options:

#### Option 1: Run Locally (Recommended for Development)
1. Export the project from AI Studio (click the Settings/Menu icon -> **Export**).
2. Extract the files on your computer.
3. Open a terminal in the folder and run:
   ```bash
   npm install
   npm run dev
   ```
4. In MT5, set the `WebhookURL` to `http://127.0.0.1:3000`.

#### Option 2: Deploy to Production (For Live Trading)
1. Deploy the app permanently (e.g., using the **Deploy** button in AI Studio, or hosting it on a VPS/Heroku/Render).
2. A deployed production app will have a clean URL without the cookie check.
3. In MT5, set the `WebhookURL` to your production URL.

## MT5 Sync Payload (Equity + Margin)

To enable the advanced margin-call protection logic, include both `equity` and `margin` in the payload sent to `POST /api/mt5/sync`.

Example payload:

```json
{
   "positions": [],
   "crl_baseline": 3000,
   "crl_current": 3045,
   "crl_diff": 45,
   "crl_budget": 500,
   "crl_threshold": 100,
   "equity": 3200,
   "margin": 740
}
```

Notes:
- `equity`: current account equity from MT5.
- `margin`: currently used margin from MT5.
- If `margin` is not provided, the app falls back to an internal estimate based on open positions.

## Expert Advisor Snapshot

The current generated EA follows the `Arkon51EA` template and sends a sync payload with:

- `positions`
- `crl_baseline`
- `crl_current`
- `crl_diff`
- `crl_budget`
- `crl_threshold`
- `equity`
- `margin`

The live bridge still uses `http://127.0.0.1:3000` locally, and the diagnostics server exposes `/api/backtest/run` and `/api/rl/train` for strategy research.
