const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

if (!code.includes('executionDecisionTraceService')) {
    code = code.replace(
        'import { checkPortfolioRisk } from "./services/portfolioRisk";',
        'import { checkPortfolioRisk } from "./services/portfolioRisk";\nimport { executionDecisionTraceService } from "./services/ExecutionDecisionTraceService";\nimport { executionSanityDiagnosticService } from "./services/ExecutionSanityDiagnosticService";'
    );
}

// 1. Portfolio Risk
const search1 = `                  if (!riskResult.isSafeToTrade) {
                      shouldExecute = false;
                      addLog(\`🛑 Risk Engine BLOCKED Trade: \${riskResult.reason}\`, "RISK");
                  }`;
const replace1 = `                  if (!riskResult.isSafeToTrade) {
                      shouldExecute = false;
                      addLog(\`🛑 Risk Engine BLOCKED Trade: \${riskResult.reason}\`, "RISK");
                      executionDecisionTraceService.initTrace(signal, false);
                      executionDecisionTraceService.recordPreTrade(false, riskResult.reason, "PORTFOLIO_RISK");
                      executionDecisionTraceService.recordBlock("PRE_TRADE", riskResult.reason);
                      executionSanityDiagnosticService.recordTrace(executionDecisionTraceService.getLatestSnapshot());
                  }`;
code = code.replace(search1, replace1);

// 2. Floating Drawdown
const search2 = `                      if (floatingDrawdownPercent >= 5.0) {
                          shouldExecute = false;
                      }`;
const replace2 = `                      if (floatingDrawdownPercent >= 5.0) {
                          shouldExecute = false;
                          executionDecisionTraceService.initTrace(signal, false);
                          executionDecisionTraceService.recordPreTrade(false, "Floating Drawdown >= 5%", "DRAWDOWN_LIMIT");
                          executionDecisionTraceService.recordBlock("PRE_TRADE", "Floating Drawdown >= 5%");
                          executionSanityDiagnosticService.recordTrace(executionDecisionTraceService.getLatestSnapshot());
                      }`;
code = code.replace(search2, replace2);

// 3. Cooldown check
const search3 = `                                                    if (elapsedMins < requiredCooldown) {
                              shouldExecute = false;
                              // Spammy log removed
                          }`;
const replace3 = `                                                    if (elapsedMins < requiredCooldown) {
                              shouldExecute = false;
                              executionDecisionTraceService.initTrace(signal, false);
                              executionDecisionTraceService.recordPreTrade(false, \`Cooldown active. Needed \${requiredCooldown}m, elapsed \${elapsedMins.toFixed(1)}m\`, "COOLDOWN_ACTIVE");
                              executionDecisionTraceService.recordBlock("PRE_TRADE", "Cooldown active");
                              executionSanityDiagnosticService.recordTrace(executionDecisionTraceService.getLatestSnapshot());
                          }`;
code = code.replace(search3, replace3);

// 4. Max Trades Per Wave
const search4 = `                                            if (shouldExecute && activeTrades.length >= (config.maxTradesPerWave || 15)) {
                          shouldExecute = false;
                          // Spammy log removed
                      }`;
const replace4 = `                                            if (shouldExecute && activeTrades.length >= (config.maxTradesPerWave || 15)) {
                          shouldExecute = false;
                          executionDecisionTraceService.initTrace(signal, false);
                          executionDecisionTraceService.recordPreTrade(false, \`Max trades per wave reached: \${activeTrades.length}\`, "MAX_WAVE_TRADES");
                          executionDecisionTraceService.recordBlock("PRE_TRADE", "Max trades per wave reached");
                          executionSanityDiagnosticService.recordTrace(executionDecisionTraceService.getLatestSnapshot());
                      }`;
code = code.replace(search4, replace4);

// 5. Pyramiding Distance
const search5 = `                              if (tradeDistance < minDistanceAdjusted) {
                                  shouldExecute = false;
                                  break;
                              }`;
const replace5 = `                              if (tradeDistance < minDistanceAdjusted) {
                                  shouldExecute = false;
                                  executionDecisionTraceService.initTrace(signal, false);
                                  executionDecisionTraceService.recordPreTrade(false, \`Too close to existing trade. Distance: \${tradeDistance.toFixed(2)}, Min: \${minDistanceAdjusted.toFixed(2)}\`, "PYRAMIDING_DISTANCE");
                                  executionDecisionTraceService.recordBlock("PRE_TRADE", "Too close to existing trade");
                                  executionSanityDiagnosticService.recordTrace(executionDecisionTraceService.getLatestSnapshot());
                                  break;
                              }`;
code = code.replace(search5, replace5);


fs.writeFileSync('src/App.tsx', code);
