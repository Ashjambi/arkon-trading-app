#!/bin/bash

# STEP 1
echo "=================================================="
echo "STEP 1 — FILE / INTEGRATION EVIDENCE"
echo "=================================================="
TOKENS=(
  "MultiStrategySignalCoordinatorService"
  "multiStrategySignalCoordinatorService"
  "coordinate("
  "candidateSignals"
  "finalSignals\[0\]"
  "generateSignal("
  "break;"
  "recordCoordinationRun"
)
for t in "${TOKENS[@]}"; do
  # Use grep -r for tokens. For finalSignals[0], we escape brackets in bash arrays.
  res=$(grep -rnE "$t" src/ 2>/dev/null)
  if [ -n "$res" ]; then
    while IFS= read -r line; do
      filepath=$(echo "$line" | cut -d':' -f1)
      linenum=$(echo "$line" | cut -d':' -f2)
      content=$(echo "$line" | cut -d':' -f3-)
      echo "FOUND $(echo "$t" | sed 's/\\//g') in $filepath:$linenum => $content"
    done <<< "$res"
  else
    echo "NOT FOUND: $(echo "$t" | sed 's/\\//g')"
  fi
done
echo ""

# STEP 2
echo "=================================================="
echo "STEP 2 — RAW CODE EXCERPTS"
echo "=================================================="
for f in src/services/tradingAlgo.ts src/services/MultiStrategySignalCoordinatorService.ts; do
  if [ -f "$f" ]; then
    echo "--- FILE: $f (LINES 1-140) ---"
    head -n 140 "$f"
    echo ""
  fi
done

if [ -f "src/services/tradingAlgo.ts" ]; then
  # Also print the section where integration sits (find where candidateSignals is)
  target_line=$(grep -n "candidateSignals" src/services/tradingAlgo.ts | head -1 | cut -d: -f1)
  if [ -n "$target_line" ]; then
    start_line=$((target_line - 50))
    if [ $start_line -lt 1 ]; then start_line=1; fi
    end_line=$((target_line + 50))
    echo "--- FILE: src/services/tradingAlgo.ts (LINES $start_line-$end_line) ---"
    sed -n "${start_line},${end_line}p" src/services/tradingAlgo.ts
  else
    echo "--- FILE: src/services/tradingAlgo.ts (LINES 140-260) ---"
    sed -n '140,260p' src/services/tradingAlgo.ts
  fi
fi
echo ""

# STEP 3
echo "=================================================="
echo "STEP 3 — EXECUTION SAFEGUARD EVIDENCE"
echo "=================================================="
SAFEGUARD_TOKENS=(
  "PreTradeRiskGuard"
  "RiskLimitsService"
  "TradingControlService"
  "execute"
  "dispatch"
  "webhook"
  "ExecutionOrchestrator"
)
for t in "${SAFEGUARD_TOKENS[@]}"; do
  res=$(grep -rn "$t" src/ 2>/dev/null)
  if [ -n "$res" ]; then
    while IFS= read -r line; do
      filepath=$(echo "$line" | cut -d':' -f1)
      linenum=$(echo "$line" | cut -d':' -f2)
      content=$(echo "$line" | cut -d':' -f3-)
      echo "FOUND $t in $filepath:$linenum => $content"
    done <<< "$res"
  else
    echo "NOT FOUND: $t"
  fi
done
echo ""

# STEP 4
echo "=================================================="
echo "STEP 4 — TEST EVIDENCE"
echo "=================================================="
NO_COLOR=1 npm test src/services/tradingAlgo.test.ts 2>&1
if [ -f "src/services/ExecutionOrchestrator.test.ts" ]; then
  NO_COLOR=1 npm test src/services/ExecutionOrchestrator.test.ts 2>&1
else
  echo "CANNOT RUN: npm test -- src/services/ExecutionOrchestrator.test.ts => file not found"
fi

