# ARKON Trading App Agent Guide

This repository is a combined React + Vite frontend and Express bridge for MT5-driven trading workflows. Keep changes narrow, validate the touched slice, and avoid rewriting generated helper scripts unless the task is explicitly about them.

## Quick Start

- Use Node 20.19+.
- Install dependencies with `npm install`.
- Start local development with `npm run dev`.
- Build production assets with `npm run build`.
- Run the main typecheck with `npm run lint`.
- Run all tests with `npm test`.
- Prefer targeted Vitest runs for touched services, for example `npx vitest run src/services/ExecutionOrchestrator.test.ts`.

## Repo Map

- `server.ts`: Express server, MT5 bridge routes, diagnostics endpoints, WebSocket market/trade bridge on port `3001`, production static serving, and local Vite middleware.
- `server.ts`: Express server, MT5 bridge routes, diagnostics endpoints, WebSocket market/trade bridge on port `3001`, backtest endpoint, RL training endpoint, production static serving, and local Vite middleware.
- `src/App.tsx`: main client shell, app state, polling plus WebSocket market feed fallback, execution flow wiring, settings UI composition, and multi-asset rebalance preview.
- `src/services/`: core business logic. Most trading behavior, orchestration, risk, diagnostics, and execution rules live here.
- `src/services/MarginMonitor.ts`: advanced margin-call monitoring, alert levels, and suggested position reductions.
- `src/services/MultiAssetManager.ts`: target-weight portfolio rebalancing logic for multi-asset allocation workflows.
- `src/services/BacktestEngine.ts`: historical OHLCV backtesting engine with trade simulation and performance metrics.
- `src/services/StrategyBacktestAdapter.ts`: adapter that runs registered runtime strategies through the backtesting engine using candle-derived market state.
- `src/services/rl/`: reinforcement learning scaffolding including trading environment, PPO-style agent, and RL training loop.
- `src/components/`: UI panels and settings surfaces.
- `src/utils/mqlCode.ts`: MQL/EA code generation helpers surfaced by the UI.
- `ARKON_MT5_EA.mq5`, `ArkonExpert.mq5`, `Arkon45EA.mq5`: MT5 Expert Advisor variants. Treat these as hand-maintained integration artifacts.
- `README.md`: product and execution behavior overview.
- `README_MT5_CONNECTION.md`: MT5 connectivity constraints and local deployment guidance.

## Working Rules

- Start from the owning service or endpoint, not from the UI wrapper, when changing behavior.
- For execution pipeline work, inspect neighboring tests in `src/services/*.test.ts` before widening scope.
- Preserve existing route aliases and backward-compatibility shims in `server.ts` unless the task explicitly removes them.
- Keep the local bridge URL aligned with `http://127.0.0.1:3000` for MT5-facing work. This repo intentionally uses that address in docs and bridge helpers.
- When editing webhook or MT5 payload logic, verify both `Authorization` header behavior and JSON field names such as `action_type`, symbol mapping, and sync fields like `equity` and `margin`.
- For WebSocket work, keep the server/client contract aligned between `server.ts` and `src/App.tsx`. Current message types include `SUBSCRIBE_MARKET_DATA`, `UNSUBSCRIBE_MARKET_DATA`, `MARKET_UPDATE`, and `EXECUTE_TRADE`.
- Do not bypass the existing execution pipeline when adding automated portfolio actions. Rebalance or server-side automation should still respect the current risk and bridge flow.
- Prefer small, focused edits in `src/services` over broad refactors in `src/App.tsx`.
- Do not treat root `fix_*.cjs`, `patch_*.cjs`, `debug_*.cjs`, or `verify*.sh` files as the source of truth. They are helper scripts from previous repair sessions, not the main runtime.

## Validation

- For service changes, run the narrowest relevant Vitest file first.
- For backtesting changes, prefer file-scoped tests around metric calculations and trade simulation edge cases before wiring UI or server automation.
- For frontend or shared type changes, run `npm run lint` after the targeted test if feasible.
- For bridge or server route changes, also sanity-check with `npm run build` when the touched area affects server bundling or SPA serving.
- For WebSocket changes, validate both sides of the contract: server message handling in `server.ts` and client lifecycle/fallback handling in `src/App.tsx`.
- If you touch MT5 integration behavior, cross-check the linked docs instead of duplicating instructions in code comments: [README.md](README.md) and [README_MT5_CONNECTION.md](README_MT5_CONNECTION.md).

## High-Friction Areas

- `ExecutionOrchestrator` and adjacent risk/execution services are a frequent change surface. Expect interactions with diagnostics, sizing, risk limits, and webhook dispatch.
- Hunter Mode is implemented in the execution stack, not as a standalone UI-only feature. Follow the service-level flow before editing config surfaces.
- MT5 integration failures often come from URL mismatches, symbol mapping, JSON payload shape, or EA compatibility issues rather than React UI code.
- Margin protection now depends on both bridge sync data and local estimation fallback. If `margin` is available from MT5 sync, prefer it over derived estimates.
- Multi-asset rebalancing currently exists as portfolio logic plus UI preview. Treat actual automated execution as a server-side orchestration concern, not a UI-only workflow.
- WebSocket market feed is additive to the existing polling path. Preserve fallback behavior unless the task explicitly removes it.
- The worktree may already be dirty. Never revert unrelated user changes.

## Collaboration Rules for Coding Assistants

1. **Never claim unverified changes.** Do not state that files were changed, tests were run, or code was executed unless proof is shown in the conversation (diff output, terminal output, or explicit user confirmation).

2. **Provide evidence for every implementation claim.** When stating that something is implemented, back it up by naming the specific files and quoting the exact relevant code blocks. Generic claims like "updated" or "fixed" are not sufficient.

3. **Keep responses focused on implementation confirmation.** Avoid verbose or generic statements. Each response should directly reference the code, diff, or test output relevant to the task at hand.

4. **Prefer updating existing architecture over rewriting core logic.** Unless explicitly requested by the user, extend or refactor the current architecture rather than replacing it. Core strategy logic changes must be explicitly authorized.

## Docs To Link, Not Recopy

- Product behavior and hedge/flip semantics: [README.md](README.md)
- MT5 bridge and local connectivity expectations: [README_MT5_CONNECTION.md](README_MT5_CONNECTION.md)
