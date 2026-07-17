export type ExecutionStyle = 'AGGRESSIVE' | 'PASSIVE' | 'MID';

export type ExecutionStyleContext = {
    signalQualityScore: number;
    volatilityRegime: string;
    stressScenarioEnabled: boolean;
    tailRiskMode: string;
    drawdownMode: string;
    timeToEventSeconds?: number;
};

class ExecutionStyleServiceImpl {
    decideStyle(context: ExecutionStyleContext): ExecutionStyle {
        // 1) Tail / hard drawdown safety
        if (context.tailRiskMode === 'TAIL_RISK' || context.drawdownMode === 'HARD_DRAWDOWN') {
            return 'PASSIVE';
        }

        const isHighVol = context.volatilityRegime === 'HIGH_VOLATILITY' || context.volatilityRegime === 'HIGH';

        // 2) Stress scenarios & high volatility
        if (context.stressScenarioEnabled || isHighVol) {
            if (context.signalQualityScore >= 70) {
                return 'MID';
            } else {
                return 'PASSIVE';
            }
        }

        // 3) Strong signals, normal/low volatility
        if (context.signalQualityScore >= 80) {
            return 'AGGRESSIVE';
        }

        // 4) Medium signals
        if (context.signalQualityScore >= 50) {
            return 'MID';
        }

        // 5) Weak signals
        return 'PASSIVE';
    }
}

export const executionStyleService = new ExecutionStyleServiceImpl();
