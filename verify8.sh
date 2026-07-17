#!/bin/bash

# STEP 1
echo "=================================================="
echo "STEP 1 — FILE EXISTENCE"
echo "=================================================="
for f in src/services/ExecutionDecisionTraceService.ts src/services/ExecutionDecisionTraceService.test.ts; do
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
  "ExecutionDecisionTraceSnapshot"
  "latestSnapshot"
  "getLatestSnapshot"
  "updateSnapshot"
  "executionDecisionTraceService"
  "execution-decision-trace"
  "initTrace"
  "recordBlock"
  "recordPreTrade"
  "recordDispatch"
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
for f in src/services/ExecutionDecisionTraceService.ts src/services/ExecutionOrchestrator.ts server.ts; do
  if [ -f "$f" ]; then
    echo "--- FILE: $f (FIRST 120 LINES) ---"
    head -n 120 "$f"
    echo ""
  fi
done

echo "--- FILE: server.ts (RELEVANT ENDPOINT BLOCK) ---"
grep -n -B 5 -A 5 "execution-decision-trace" server.ts
echo ""

# STEP 4
echo "=================================================="
echo "STEP 4 — TEST EVIDENCE"
echo "=================================================="
NO_COLOR=1 npm test -- src/services/ExecutionDecisionTraceService.test.ts 2>&1
echo ""
