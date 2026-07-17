#!/bin/bash

# STEP 1
echo "=================================================="
echo "STEP 1 — SYMBOL SEARCH"
echo "=================================================="
TOKENS=(
  "return { signals"
  "signalGenerated"
  "signal_global_compliance_rejected"
  "signals.length"
  "expect(signals.length)"
  "expect(signal)"
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

# STEP 2
echo "=================================================="
echo "STEP 2 — RAW CODE EXCERPTS"
echo "=================================================="
echo "--- FILE: src/services/tradingAlgo.ts (RELEVANT BLOCK) ---"
sed -n '730,760p' src/services/tradingAlgo.ts
echo ""

echo "--- FILE: src/services/FullPipelineMultiWinner.e2e.test.ts (RELEVANT BLOCK) ---"
cat src/services/FullPipelineMultiWinner.e2e.test.ts
echo ""

# STEP 3
echo "=================================================="
echo "STEP 3 — TEST EXECUTION"
echo "=================================================="
NO_COLOR=1 npm test -- src/services/FullPipelineMultiWinner.e2e.test.ts 2>&1
echo ""
