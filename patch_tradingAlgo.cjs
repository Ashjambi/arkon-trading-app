const fs = require('fs');
let code = fs.readFileSync('src/services/tradingAlgo.ts', 'utf8');

const importStatement = `import { evaluateSignalQuality } from "./SignalQualityService";\nimport { stressScenarioService } from "./StressScenarioService";`;
if (!code.includes('evaluateSignalQuality')) {
    code = code.replace('import { stressScenarioService } from "./StressScenarioService";', importStatement);
}

const targetStr = `const execOutput = executionQualityEngine.evaluate(execInput);
                sig.executionHints = execOutput;`;

const replacementStr = `const execOutput = executionQualityEngine.evaluate(execInput);
                sig.executionHints = execOutput;

                // --- Signal Quality Enrichment Layer ---
                const zScoreAbs = partialState.vwapZScore !== undefined && !isNaN(partialState.vwapZScore) ? Math.abs(partialState.vwapZScore) : null;
                const breakdown = evaluateSignalQuality({
                    baseQualityScore: sig.qualityScore,
                    volatilityRegime: partialState.regime as 'LOW' | 'MEDIUM' | 'HIGH',
                    executionPenaltyFactor: execOutput.executionPenaltyFactor,
                    stressScenarioEnabled: stressScenarioService.isEnabled(),
                    zScoreAbs
                });
                
                sig.qualityScore = breakdown.finalQualityScore;
                if (!sig.metadata) sig.metadata = {};
                sig.metadata.signalQualityBreakdown = breakdown;`;

if (!code.includes('Signal Quality Enrichment Layer')) {
    code = code.replace(targetStr, replacementStr);
}

fs.writeFileSync('src/services/tradingAlgo.ts', code);
console.log('Patched tradingAlgo.ts');
