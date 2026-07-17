#!/bin/bash

# STEP 1
echo "=================================================="
echo "STEP 1 — FILE EXISTENCE"
echo "=================================================="
for f in src/services/tradingAlgo.ts src/App.tsx src/services/ExecutionOrchestrator.ts src/services/ExecutionOrchestrator.test.ts; do
  if [ -f "$f" ]; then
    echo "EXISTS: $f"
  else
    echo "MISSING: $f"
  fi
done
echo ""

# STEP 2
echo "=================================================="
echo "STEP 2 — SYMBOL SEARCH"
echo "=================================================="
TOKENS=(
  "signals:"
  "signalsToExecute"
  "executePlan"
  "finalSignals"
  "maxTradesPerWave"
  "availableSlots"
  "fixedLotSizeBTC"
  "fixedLotSizeETH"
  "handleSendSignal"
  "executeSignal("
  "executePlan("
  "coordResult.finalSignals"
  "return { signal:"
  "return { signals:"
)
for t in "${TOKENS[@]}"; do
  res=$(grep -rn "$t" src/ server.ts 2>/dev/null)
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

# STEP 3
echo "=================================================="
echo "STEP 3 — RAW CODE EXCERPTS"
echo "=================================================="
if [ -f "src/services/tradingAlgo.ts" ]; then
  echo "--- FILE: src/services/tradingAlgo.ts (RELEVANT BLOCK) ---"
  grep -n -B 5 -A 40 "coordResult.finalSignals" src/services/tradingAlgo.ts
  echo "..."
  grep -n -B 5 -A 5 "return { signals" src/services/tradingAlgo.ts
  echo ""
fi

if [ -f "src/services/ExecutionOrchestrator.ts" ]; then
  echo "--- FILE: src/services/ExecutionOrchestrator.ts (RELEVANT BLOCK) ---"
  grep -n -B 5 -A 30 "executePlan(" src/services/ExecutionOrchestrator.ts
  echo ""
fi

if [ -f "src/App.tsx" ]; then
  echo "--- FILE: src/App.tsx (RELEVANT BLOCK) ---"
  grep -n -B 5 -A 10 "const { signals" src/App.tsx
  echo "..."
  grep -n -B 5 -A 20 "handleSendSignal(" src/App.tsx
  echo ""
fi

# STEP 4
echo "=================================================="
echo "STEP 4 — TEST SCENARIO EVIDENCE"
echo "=================================================="
TEST_TOKENS=(
  "should limit parallel executions based on config"
  "should split lot sizes according to available slots"
  "executePlan"
  "maxTradesPerWave"
  "webhook"
)
for t in "${TEST_TOKENS[@]}"; do
  res=$(grep -rn "$t" src/services/ExecutionOrchestrator.test.ts 2>/dev/null)
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

# STEP 5
echo "=================================================="
echo "STEP 5 — TEST EXECUTION"
echo "=================================================="
NO_COLOR=1 npm test -- src/services/ExecutionOrchestrator.test.ts 2>&1

