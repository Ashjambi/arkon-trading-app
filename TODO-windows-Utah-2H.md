# ARKON Bridge UI Fix — Implementation TODO

## ✅ Part 1: Fix `fetchMarketSummary ReferenceError`
- [x] Add `fetchMarketSummary` import in `src/hooks/useSignalEngine.ts`

## ✅ Part 2: Fix 401 on `/api/bridge/settings` POST
- [x] Add `Authorization: Bearer <webhookSecret>` header in `src/hooks/useSettings.ts` auto-sync useEffect

## ✅ Part 3: Fix WebSocket ERR_CONNECTION_REFUSED on port 3001
- [x] Add `"ws": "^8.18.0"` to `package.json` dependencies
- [x] Improve WS catch block in `server.ts` with clearer error message

## ✅ Part 4: Install dependencies & test
- [x] Run `npm install` to install `ws` package

