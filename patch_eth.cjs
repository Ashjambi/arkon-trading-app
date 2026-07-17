const fs = require('fs');
const path = './src/services/strategies/ETH/ETH_SCALPER.ts';
let code = fs.readFileSync(path, 'utf8');

const importStatement = `import { positionSizingEngine, PositionSizingInput } from '../../PositionSizingEngine';\n`;
if (!code.includes('PositionSizingEngine')) {
    code = importStatement + code;
}

const sizingLogic = `
      // Dynamic Position Sizing
      const baseConfigSize = config.fixedLotSizeETH || 0.2;
      const institutionalRiskCap = 10.0; // Max allowed for ETH by default

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

const returnStatement = `      return {
        id: \`ETH_SCALPER-\${Date.now()}\`,
        timestamp: Date.now(),
        asset: state.asset,
        direction,
        strength: SignalStrength.STRONG,
        entry: state.price,
        stopLoss: risk.stopLoss,
        takeProfit: risk.takeProfit,
        tp1: risk.tp1,
        tp2: risk.tp2,
        qualityScore: score,
        recommendedSize: sizing.recommendedSize,
        reasoning:
          "Quant Institutional Scalper: Liquidity sweep detected with VWAP trend alignment.",
        strategy: "ETH_SCALPER",`;

code = code.replace(/return \{\s+id: \`ETH_SCALPER-\$\{Date\.now\(\)\}\`,[\s\S]*?strategy: "ETH_SCALPER",/, returnStatement);
code = code.replace(`const risk = calculateInstitutionalRisk(state, direction, 'SCALPER');`, `const risk = calculateInstitutionalRisk(state, direction, 'SCALPER');\n${sizingLogic}`);

fs.writeFileSync(path, code);
