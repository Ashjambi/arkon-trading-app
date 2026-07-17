#!/bin/bash

# STEP 1
echo "=================================================="
echo "STEP 1 — FILE EXISTENCE"
echo "=================================================="
for f in src/services/PortfolioRiskOverlayService.ts src/services/PortfolioRiskOverlayService.test.ts; do
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
for f in src/services/PortfolioRiskOverlayService.ts src/services/PortfolioRiskOverlayService.test.ts; do
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
  "strategyWeights"
  "maxConcurrentStrategiesPerAsset"
  "maxSimilarThemeSignals"
  "maxDirectionalBiasPerAsset"
  "SUPPRESSED_PORTFOLIO_CROWDING"
  "SUPPRESSED_THEME_DUPLICATION"
  "SUPPRESSED_LOW_PRIORITY"
  "adjustedSizeFactor"
  "suppressedByReason"
  "suppressedByStrategy"
  "portfolioOverlayAdjustments"
)
for t in "${TOKENS[@]}"; do
  res=$(grep -rn "$t" src/ 2>/dev/null)
  if [ -n "$res" ]; then
    while IFS= read -r line; do
      filepath=$(echo "$line" | cut -d':' -f1)
      linenum=$(echo "$line" | cut -d':' -f2)
      content=$(echo "$line" | cut -d':' -f3-)
      # Strip leading whitespace from content if desired, or keep raw
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
npm test src/services/PortfolioRiskOverlayService.test.ts 2>&1

