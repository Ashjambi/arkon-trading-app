const fs = require('fs');
const path = './src/services/PositionSizingEngine.ts';
let code = fs.readFileSync(path, 'utf8');

code = code.replace(`
        // 1. Adjust upward modestly when signalStrength is high
        const normStrength = Math.min(Math.max(signalStrength / 100, 0), 1); // assuming 0-100
        if (normStrength > 0.8 && volatilityProxy < 1.2 && microstructureRisk < 0.4) {
            sizeFactor += 0.2; // Modest increase
        } else if (normStrength > 0.9 && volatilityProxy < 1.0 && microstructureRisk < 0.2) {
            sizeFactor += 0.4;
        }

        // 2. Adjust downward when volatility is high
        if (volatilityProxy > 1.5) {
            sizeFactor *= 0.7;
            clampedByVolatility = true;
        } else if (volatilityProxy > 2.0) {
            sizeFactor *= 0.5;
            clampedByVolatility = true;
        }

        // 3. Adjust downward when microstructure risk is high
        if (microstructureRisk > 0.7) {
            sizeFactor *= 0.7;
            clampedByMicrostructure = true;
        } else if (microstructureRisk > 0.9) {
            sizeFactor *= 0.5;
            clampedByMicrostructure = true;
        }
`, `
        // 1. Adjust upward modestly when signalStrength is high
        const normStrength = Math.min(Math.max(signalStrength / 100, 0), 1); // assuming 0-100
        if (normStrength > 0.9 && volatilityProxy < 1.0 && microstructureRisk < 0.2) {
            sizeFactor += 0.4;
        } else if (normStrength > 0.8 && volatilityProxy < 1.2 && microstructureRisk < 0.4) {
            sizeFactor += 0.2; // Modest increase
        }

        // 2. Adjust downward when volatility is high
        if (volatilityProxy > 2.0) {
            sizeFactor *= 0.5;
            clampedByVolatility = true;
        } else if (volatilityProxy > 1.5) {
            sizeFactor *= 0.7;
            clampedByVolatility = true;
        }

        // 3. Adjust downward when microstructure risk is high
        if (microstructureRisk > 0.9) {
            sizeFactor *= 0.5;
            clampedByMicrostructure = true;
        } else if (microstructureRisk > 0.7) {
            sizeFactor *= 0.7;
            clampedByMicrostructure = true;
        }
`);

fs.writeFileSync(path, code);
