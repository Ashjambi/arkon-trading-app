#!/bin/bash

# STEP 1
echo "=================================================="
echo "STEP 1 — FILE EXISTENCE"
echo "=================================================="
if [ -f "src/services/FullPipelineMultiWinner.e2e.test.ts" ]; then
    echo "EXISTS: src/services/FullPipelineMultiWinner.e2e.test.ts"
else
    echo "MISSING: src/services/FullPipelineMultiWinner.e2e.test.ts"
fi
echo ""

# STEP 2
echo "=================================================="
echo "STEP 2 — SYMBOL SEARCH"
echo "=================================================="
TOKENS=(
  "FullPipelineMultiWinner"
  "generateSignal("
  "MultiStrategySignalCoordinatorService"
  "coordinationTraceService"
  "executionDecisionTraceService"
  "executePlan("
  "sendToWebhook"
  "BTC_TREND"
  "BTC_MEAN_REV"
  "maxSameDirectionSignalsPerAsset"
  "dispatched"
  "coordinationUsed"
)
for t in "${TOKENS[@]}"; do
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

# STEP 3
echo "=================================================="
echo "STEP 3 — RAW CODE EXCERPT"
echo "=================================================="
echo "--- FILE: src/services/FullPipelineMultiWinner.e2e.test.ts (FIRST 220 LINES) ---"
head -n 220 src/services/FullPipelineMultiWinner.e2e.test.ts
echo ""

# STEP 4
echo "=================================================="
echo "STEP 4 — TEST EXECUTION"
echo "=================================================="
NO_COLOR=1 npm test -- src/services/FullPipelineMultiWinner.e2e.test.ts 2>&1
echo ""
