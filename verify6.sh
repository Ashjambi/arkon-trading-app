#!/bin/bash

# STEP 1
echo "=================================================="
echo "STEP 1 — FILE / INTEGRATION EVIDENCE"
echo "=================================================="
TOKENS=(
  "CoordinationTraceService"
  "coordinationTraceService"
  "updateSnapshot("
  "getLatestSnapshot()"
  "/api/diagnostics/coordination-trace"
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

# STEP 2
echo "=================================================="
echo "STEP 2 — RAW CODE EXCERPTS"
echo "=================================================="
for f in src/services/CoordinationTraceService.ts src/services/MultiStrategySignalCoordinatorService.ts; do
  if [ -f "$f" ]; then
    echo "--- FILE: $f (FIRST 100 LINES) ---"
    head -n 100 "$f"
    echo ""
  fi
done

echo "--- FILE: server.ts (LINES 115-135) ---"
sed -n '115,135p' server.ts
echo ""

# STEP 3
echo "=================================================="
echo "STEP 3 — TEST EVIDENCE"
echo "=================================================="
NO_COLOR=1 npm test src/services/CoordinationTraceService.test.ts 2>&1
NO_COLOR=1 npm test src/services/MultiStrategySignalCoordinatorService.test.ts 2>&1

