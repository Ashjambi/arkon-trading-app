# 🏛️ ARKON Quant Terminal

Advanced quantitative trading terminal connecting MT5 Expert Advisors with a modern React + Express stack for signal generation, execution orchestration, and multi-layer risk management.

---

## Active Trading Assets

| Asset  | Status         | Notes                                      |
|--------|----------------|--------------------------------------------|
| **BTC** | ✅ **Active**  | Primary trading pair. Full pipeline live.  |
| **ETH** | ✅ **Active**  | Secondary pair. Full pipeline live.        |
| **GOLD** | 🔄 **In Progress** | Implementation plan defined. See [GOLD Activation Plan](#gold-xauusd-activation-plan). |
| **SOL**  | ⏳ Planned   | Under evaluation, not yet active.          |
| **XRP**  | ⏳ Planned   | Under evaluation, not yet active.          |
| **USDT** | ⏳ Secondary  | Stablecoin pairs present but not live.     |

---

## Current Status

- **Live pipeline**: BTC and ETH are fully wired through the EA → Bridge → Execution Orchestrator → Risk Engine → MT5.
- **GOLD (XAUUSD)**: Implementation plan is defined and approved. GOLD strategies (`GOLD_TREND`, `GOLD_MEAN_REV`, `GOLD_SCALPER`) exist in the codebase. The asset needs to be wired through the full pipeline: EA parameters → Market Data → Signal Engine → UI → Risk.
- **Other assets** (SOL, XRP, USDT pairs): Exist in the codebase as strategy definitions and UI placeholders, but **are not yet connected through the full live trading pipeline** (EA + bridge + UI + risk).
- **Documentation**: Aligned to reflect only actively trading assets. Planned assets are clearly marked.
- **Version**: v50.1.0 (Sprint 1-3: Market Microstructure, Performance Gates & Post-Trade Analytics).

---

## Next Sprint Priorities

1. **P0 — Stabilize BTC/ETH Live Pipeline**
   - Monitor bridge sync reliability
   - Fix any remaining EA compatibility issues
   - Validate end-to-end signal → execution flow

2. **P1 — Improve Signal Quality & Risk Management**
   - Enhance regime detection accuracy (Hurst, Fisher)
   - Tune position sizing for current market conditions
   - Tighten risk limit boundaries

3. **P2 — GOLD (XAUUSD) Activation** 🔄 *In Progress*
   - **MT5 EA**: Add GOLD-specific input params (enable/disable, risk per trade, max positions, spread filter, session filter)
   - **MT5 EA**: Add GOLD-specific lot scaling (0.005 per $1000 equity increment, max 0.5 lots)
   - **Frontend Market Data**: Add GOLD WebSocket subscriptions + data refs + analysis state
   - **Frontend Signal Engine**: Add GOLD to `processAsset` polling loop with Binance XAUUSDT fallback
   - **Frontend UI**: Add GOLD MarketStats panel alongside BTC/ETH
   - **Execution Orchestrator**: Add GOLD spread filter, session filter, and lot cap
   - **Risk Management**: Add GOLD-specific risk limits (lower max exposure, tighter stops)
   - **Validation**: Run backtest validation before going live

4. **P3 — Expand Multi-Asset Support**
   - SOL, XRP, USDT pairs added after GOLD validation

---

## Architecture Overview

```
MT5 (EA) ←→ Bridge Server (Express) ←→ Execution Orchestrator ←→ Risk Engine
                                            ↓
                                     Signal Engine & Strategies
                                            ↓
                                     React UI (Vite + TypeScript)
```

**Key components**:
- **EA (MQL5)**: Expert Advisor running in MetaTrader 5, receives signals and sends trade status
- **Bridge Server** (`server.ts`): Express server on `http://127.0.0.1:3000` handling webhooks, WebSocket market data, MT5 sync, diagnostics
- **Execution Orchestrator**: Pipe that applies compliance, risk limits, position sizing, and strategy arbitration before dispatching to MT5
- **Risk Engine**: Multi-layer protection (PreTradeRiskGuard, RiskLimitsService, PortfolioDrawdownFloor, etc.)
- **Signal Engine**: Multi-strategy signal generation with regime detection (Hurst, Fisher, VWAP, Garman-Klass volatility, etc.)

---

## MT5 Bridge / EA Instructions

### Connection Setup
1. Ensure the bridge server is running at: `http://127.0.0.1:3000`
2. Deploy the EA (`ARKON_MT5_EA.mq5` or variant) to an MT5 chart
3. The EA will sync status via `/api/mt5/sync` and receive signals

### Signal Payload Format
The EA expects JSON with fields including:
- `action_type`: `"ENTRY"`, `"FLIP"`, `"HEDGE"`, `"BOOST"`, `"CLOSE"`, `"CLOSE_ALL"`
- `symbol`: e.g., `"BTCUSD"`, `"ETHUSD"`
- `volume`: lot size (minimum `0.01`)
- `stop_loss` / `take_profit`: price levels
- `close_opposite`: boolean for FLIP operations

### Troubleshooting
- Check bridge status: `GET /api/bridge/status`
- Check recent errors: `GET /api/diagnostics/errors`
- Verify WebSocket connection on port `3001`
- Default webhook secret: `ARKON_SECURE_2025` (change in production)

---

## Quick Start

```bash
# Requirements: Node.js 20.19+
npm install
npm run dev        # Development (Vite + Express)
npm run build      # Production build
npm run start      # Start production server
npm run lint       # TypeScript check
npm test           # Run all tests
```

---

## Strategy Stack

| Strategy Class             | Assets          | Timeframe |
|----------------------------|-----------------|-----------|
| BTC_TREND                  | BTC             | 1H–4H     |
| BTC_MEAN_REV               | BTC             | 15m–1H    |
| BTC_SCALPER                | BTC             | 5m–15m    |
| ETH_TREND                  | ETH             | 1H–4H     |
| ETH_MEAN_REV               | ETH             | 15m–1H    |
| ETH_VOL_BREAK              | ETH             | 30m–2H    |
| **GOLD_TREND**             | **GOLD**        | **1H–4H** |
| **GOLD_MEAN_REV**          | **GOLD**        | **15m–1H**|
| **GOLD_SCALPER**           | **GOLD**        | **5m–15m**|
| NEWS_SHOCK                 | BTC, ETH        | Event     |
| VOLATILITY_BREAKOUT        | All             | 1H–4H     |

---

## Risk Layers (in order)

1. **PreTradeRiskGuard** — sanity checks before any execution
2. **RiskLimitsService** — daily loss limits, max positions
3. **StrategyRiskBudgetService** — per-strategy budget allocation
4. **PortfolioDrawdownFloorService** — max drawdown protection
5. **PortfolioVolatilityTargetService** — volatility targeting
6. **TailRiskModeService** — tail-risk hedging mode
7. **MarginMonitor** — margin call prevention

---

## Documentation

- **[AGENTS.md](AGENTS.md)** — Agent collaboration rules and repo map
- **[README_MT5_CONNECTION.md](README_MT5_CONNECTION.md)** — MT5 connectivity details
- **[UPDATES_LOG.md](UPDATES_LOG.md)** — Version history and changelog

---

## GOLD (XAUUSD) Activation Plan

### Overview
GOLD (XAUUSD) is being activated as a first-class trading asset across the entire pipeline. GOLD has unique characteristics vs crypto:
- **Lower volatility**: DVOL ~10-20 vs 50-80 for BTC
- **No funding rate**: Skip funding-based signals
- **Session-based liquidity**: Best during London/NY overlap (08:00-17:00 UTC)
- **Tight spreads**: 0.1-0.5 pip during active sessions
- **Binance data source**: Uses XAUUSDT as primary data (Deribit has no gold perpetual)

### Implementation Layers

#### 1. MT5 Expert Advisor (`Arkon45EA.mq5`)
- **New input parameters**: `EnableGoldTrading`, `GoldMaxRiskPerTrade`, `GoldMaxConcurrentPositions`, `GoldSpreadFilter`, `GoldSessionFilter`, `GoldSessionStart`, `GoldSessionEnd`, `GoldFixedLotSize`
- **Lot scaling**: `lotSize + (increments * 0.005)` per $1000 equity (vs 0.01 for BTC)
- **Max lot cap**: 0.5 lots (vs 1.0 for BTC)
- **Spread filter**: Block trades when spread > configurable threshold (default 50 points)
- **Session filter**: Block trades outside London/NY overlap (default 08:00-17:00 UTC)

#### 2. Frontend Market Data (`src/hooks/useMarketData.ts`)
- Add `goldDataRef` for GOLD market data
- Subscribe to GOLD WebSocket feeds (Binance XAUUSDT via hybrid system)
- Add `goldAnalysis` state and `setGoldAnalysis`
- Add GOLD to `fetchAssetData` with Binance fallback

#### 3. Frontend Signal Engine (`src/hooks/useSignalEngine.ts`)
- Add GOLD to `processAsset` function with GOLD-specific data sources (no DVOL/options)
- Use `fixedLotSizeGOLD` from config for base lot size
- Add GOLD to `executeSignalStep` margin checks

#### 4. Frontend UI (`src/App.tsx`)
- Add GOLD to the 30s polling loop (BTC → ETH → GOLD with stagger)
- Add GOLD MarketStats panel alongside BTC/ETH
- Add GOLD to `useMarketData` and `useSignalEngine` destructuring

#### 5. Execution Orchestrator (`src/services/ExecutionOrchestrator.ts`)
- GOLD price staleness check (existing, enhanced)
- GOLD spread filter (new)
- GOLD session filter (new)
- GOLD lot size cap (new)

#### 6. Risk Management
- GOLD-specific max exposure (50% of normal allocation)
- Tighter stop losses (0.5-1.0% vs 1.5-2.0% for crypto)
- Lower max concurrent positions (5 vs 15 for BTC)

### Validation Checklist
- [ ] MT5: GOLD symbol resolves correctly (XAUUSD, XAUUSD.m, GOLD)
- [ ] MT5: Spread filter blocks trades when spread > threshold
- [ ] MT5: Session filter blocks trades outside 08:00-17:00 UTC
- [ ] MT5: Lot scaling works (0.005 per $1000 equity)
- [ ] Frontend: GOLD market data appears in console
- [ ] Frontend: GOLD signals appear in signal stream
- [ ] Frontend: GOLD panel renders with correct data
- [ ] Bridge: GOLD positions sync correctly
- [ ] Risk: GOLD respects max positions and exposure limits

---

**⚠️ Disclaimer**: Trading involves significant risk. This system is designed for professional traders who understand hedging, leverage, and algorithmic execution risks.
