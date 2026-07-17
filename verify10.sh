#!/bin/bash

# STEP 1
echo "=================================================="
echo "STEP 1 — FILE EXISTENCE"
echo "=================================================="
if [ -f "src/services/ParallelWinnerExecution.e2e.test.ts" ]; then
    echo "EXISTS: src/services/ParallelWinnerExecution.e2e.test.ts"
else
    echo "MISSING: src/services/ParallelWinnerExecution.e2e.test.ts"
fi
echo ""

# STEP 2
echo "=================================================="
echo "STEP 2 — SYMBOL SEARCH"
echo "=================================================="
TOKENS=(
  "Parallel winners allowed by config"
  "Parallel winners capped by config"
  "blocked by trading control"
  "blocked by pre-trade"
  "executePlan"
  "maxTradesPerWave"
  "dispatched"
  "blockedStage"
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
head -n 180 src/services/ParallelWinnerExecution.e2e.test.ts
echo ""

# STEP 4
echo "=================================================="
echo "STEP 4 — TEST EVIDENCE"
echo "=================================================="
NO_COLOR=1 npm test -- src/services/ParallelWinnerExecution.e2e.test.ts 2>&1
echo ""
