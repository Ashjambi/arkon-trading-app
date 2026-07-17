const fs = require('fs');
const path = './src/services/strategies/CointegrationStrategy.ts';
let code = fs.readFileSync(path, 'utf8');

const importStatement = `import { positionSizingEngine, PositionSizingInput } from '../PositionSizingEngine';\n`;
if (!code.includes('PositionSizingEngine')) {
    code = importStatement + code;
}

const sizingLogic = `
        // Dynamic Position Sizing
        const baseConfigSize = isBTC ? (config.fixedLotSizeBTC || 0.1) : (config.fixedLotSizeETH || 0.2);
        const institutionalRiskCap = isBTC ? 5.0 : 10.0; // Max allowed by default

        let microstructureRisk = 0.5;
        if (state.orderBookImbalance !== null && state.orderBookImbalance !== undefined) {
            const obi = state.orderBookImbalance;
            const adverseObi = direction === SignalDirection.LONG ? -obi : obi;
            microstructureRisk = (Math.max(-1, Math.min(1, adverseObi)) + 1) / 2;
        }
        if (state.toxicityMetric !== null && state.toxicityMetric !== undefined && state.normalizedOfi !== null) {
            const nofi = state.normalizedOfi || 0;
            const adverseNofi = direction === SignalDirection.LONG ? -nofi : nofi;
            const flowRisk = (Math.max(-1, Math.min(1, adverseNofi)) + 1) / 2;
            microstructureRisk = (microstructureRisk + flowRisk + (state.toxicityMetric * 0.5)) / 2.5;
        }

        const sizingInput: PositionSizingInput = {
            asset: state.asset,
            direction,
            signalStrength: score,
            volatilityProxy: state.volRatio || 1.0,
            microstructureRisk,
            regime: state.regime,
            baseConfigSize,
            hunterMode: !!config.hunterMode,
            institutionalRiskCap
        };
        
        const sizing = positionSizingEngine.calculateSize(sizingInput);
`;

const returnStatement = `        return {
            id: \`COINT-\${state.asset}-\${Date.now()}\`,
            timestamp: Date.now(),
            asset: state.asset,
            direction,
            strength: score > 85 ? SignalStrength.STRONG : SignalStrength.STANDARD,
            entry: state.price,
            stopLoss: risk.stopLoss,
            takeProfit: risk.takeProfit,
            tp1: risk.tp1,
            tp2: risk.tp2,
            qualityScore: score,
            recommendedSize: sizing.recommendedSize,
            reasoning: \`Cointegration divergence vs \${targetAsset}. VWAP Dev: \${(state.vwapDeviation * 100).toFixed(2)}%, Funding Diff: \${(fundingDiff * 100).toFixed(4)}%\`,
            strategy: 'COINTEGRATION',`;

code = code.replace(/return \{\s+id: \`COINT-\$\{state\.asset\}-\$\{Date\.now\(\)\}\`,[\s\S]*?strategy: 'COINTEGRATION',/, returnStatement);
code = code.replace(`const risk = calculateInstitutionalRisk(state, direction, 'MEAN_REV');`, `const risk = calculateInstitutionalRisk(state, direction, 'MEAN_REV');\n${sizingLogic}`);

fs.writeFileSync(path, code);
