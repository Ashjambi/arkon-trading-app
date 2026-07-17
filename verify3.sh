#!/bin/bash

# STEP 1
echo "=================================================="
echo "STEP 1 — FILE EXISTENCE"
echo "=================================================="
for f in src/services/StrategyArbitrationService.ts src/services/StrategyArbitrationService.test.ts; do
  if [ -f "$f" ]; then
    echo "EXISTS: $f"
  else
    echo "MISSING: $f"
  fi
done
echo ""

# STEP 2
echo "=================================================="
echo "STEP 2 — CODE EXCERPTS"
echo "=================================================="
for f in src/services/StrategyArbitrationService.ts src/services/StrategyArbitrationService.test.ts; do
  if [ -f "$f" ]; then
    echo "--- FILE: $f (FIRST 80 LINES) ---"
    head -n 80 "$f"
    echo ""
    echo "--- EXPORTS: $f ---"
    grep -E "^export " "$f" || echo "None"
    echo ""
  fi
done

# STEP 3
echo "=================================================="
echo "STEP 3 — SYMBOL SEARCH"
echo "=================================================="
TOKENS=(
  "arbitrate"
  "selectedSignals"
  "suppressedSignals"
  "finalScore"
  "SUPPRESSED_CONFLICTING_SIGNAL"
  "SUPPRESSED_LOW_PRIORITY"
  "SUPPRESSED_DEGRADED_ENVIRONMENT"
  "arbitrationDecisions"
  "selectedByStrategy"
  "suppressedByReason"
  "suppressedByStrategy"
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

# STEP 4
echo "=================================================="
echo "STEP 4 — TESTS"
echo "=================================================="
NO_COLOR=1 npm test src/services/StrategyArbitrationService.test.ts 2>&1

