#!/usr/bin/env bash
# CI Guard — recordBlock direct usage check
#
# Scans TypeScript source (excluding test files and the deprecated wrapper
# definition) for any prohibited direct `recordBlock(` call.
#
# Exit code 0 if no forbidden usage found.
# Exit code 1 with offending file paths/line numbers if a violation exists.
#
# Usage:
#   bash scripts/ci-guard-recordBlock.sh
#
# Expected configuration:
#   recordBlock() is deprecated. All production callers MUST use:
#     - eventTaxonomyService.recordRiskBlocked({...})
#     - eventTaxonomyService.recordSignalFiltered({...})
#     - executionDecisionTraceService.recordRiskBlocked({...})
#     - executionDecisionTraceService.recordSignalFiltered({...})

set -euo pipefail

# Directory to scan (relative to repository root)
SRC_DIR="src"
SERVER_FILE="server.ts"

# Patterns to EXCLUDE (allowed occurrences)
# 1. The method definition itself in ExecutionDecisionTraceService
# 2. Test files (ExecutionDecisionTraceService.test.ts, etc.)
# 3. This CI guard script itself (not a TS file)

EXCLUDE_PATTERNS=(
    "src/services/ExecutionDecisionTraceService.ts"   # method definition (deprecated wrapper)
    "\.test\.ts"                                       # all test files
    "\.spec\.ts"                                       # all spec files
)

# Build grep exclude arguments
GREP_EXCLUDE_ARGS=()
for pattern in "${EXCLUDE_PATTERNS[@]}"; do
    GREP_EXCLUDE_ARGS+=("--exclude-dir=node_modules")
    GREP_EXCLUDE_ARGS+=("--exclude-dir=dist")
    GREP_EXCLUDE_ARGS+=(--exclude="$pattern")
done

# We can't use --exclude with glob patterns easily, so use grep -v pipeline
# Strategy: find all .ts files, then filter out exclusions, then grep for recordBlock(

VIOLATIONS=0
VIOLATION_FILES=""

# Find all TypeScript source files (excluding node_modules, dist, and test files)
while IFS= read -r -d '' file; do
    # Normalize path to forward slashes
    normalized_file=$(echo "$file" | sed 's|\\|/|g')
    
    # Skip files matching exclusion patterns
    skip=false
    for pattern in "${EXCLUDE_PATTERNS[@]}"; do
        if echo "$normalized_file" | grep -qE "$pattern"; then
            skip=true
            break
        fi
    done
    [[ "$skip" == true ]] && continue
    
    # Check for recordBlock( calls
    if grep -n "recordBlock(" "$file" 2>/dev/null; then
        VIOLATIONS=$((VIOLATIONS + 1))
        VIOLATION_FILES="$VIOLATION_FILES  $normalized_file"$'\n'
    fi
done < <(find "$SRC_DIR" -name "*.ts" -type f -print0 2>/dev/null)

# Also check server.ts if it exists
if [[ -f "$SERVER_FILE" ]]; then
    if grep -n "recordBlock(" "$SERVER_FILE" 2>/dev/null; then
        VIOLATIONS=$((VIOLATIONS + 1))
        VIOLATION_FILES="$VIOLATION_FILES  $SERVER_FILE (root)"$'\n'
    fi
fi

if [[ $VIOLATIONS -gt 0 ]]; then
    echo ""
    echo "============================================"
    echo "❌ CI GUARD FAILED: recordBlock() violations detected"
    echo "============================================"
    echo ""
    echo "Found $VIOLATIONS prohibited direct recordBlock() call(s) in:"
    echo "$VIOLATION_FILES"
    echo ""
    echo "recordBlock() is DEPRECATED."
    echo "All production callers must use typed taxonomy methods:"
    echo "  - eventTaxonomyService.recordRiskBlocked({...})     # RISK_BLOCKED"
    echo "  - eventTaxonomyService.recordSignalFiltered({...}) # SIGNAL_FILTERED"
    echo "  - executionDecisionTraceService.recordRiskBlocked({...})    # dual-write trace"
    echo "  - executionDecisionTraceService.recordSignalFiltered({...}) # dual-write trace"
    echo ""
    echo "Allowed locations (excluded from this check):"
    echo "  - src/services/ExecutionDecisionTraceService.ts (method def — deprecated wrapper)"
    echo "  - *.test.ts / *.spec.ts (unit tests)"
    echo ""
    exit 1
fi

echo ""
echo "============================================"
echo "✅ CI GUARD PASSED: No prohibited recordBlock() usage"
echo "============================================"
echo ""
echo "All production callers have been migrated to typed taxonomy methods."
echo "Scanned: $SRC_DIR/*.ts + $SERVER_FILE"
echo "Excluded: method definition, test files"
echo ""
exit 0
