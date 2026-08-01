export type RLAction = 0 | 1 | 2 | 3 | 4;

export interface Transition {
    state: number[];
    action: RLAction;
    reward: number;
    nextState: number[];
    done: boolean;
}

export interface PPOAgentConfig {
    stateSpace: number;
    actionSpace: number;
    learningRate: number;
    epsilon?: number;
}

export class PPOAgent {
    private readonly stateSpace: number;
    private readonly actionSpace: number;
    private readonly learningRate: number;
    private epsilon: number;
    private readonly policyWeights: number[][];
    private readonly valueWeights: number[];
    private readonly memory: Transition[] = [];

    constructor(config: PPOAgentConfig) {
        this.stateSpace = config.stateSpace;
        this.actionSpace = config.actionSpace;
        this.learningRate = config.learningRate;
        this.epsilon = config.epsilon ?? 0.1;
        this.policyWeights = Array.from({ length: this.actionSpace }, () =>
            Array.from({ length: this.stateSpace }, () => (Math.random() - 0.5) * 0.01)
        );
        this.valueWeights = Array.from({ length: this.stateSpace }, () => 0);
    }

    public selectAction(state: number[]): RLAction {
        const normalized = this.normalizeState(state);
        if (Math.random() < this.epsilon) {
            return Math.floor(Math.random() * this.actionSpace) as RLAction;
        }

        const scores = this.policyWeights.map((weights) => this.dot(weights, normalized));
        let bestAction = 0;
        let bestScore = scores[0] ?? Number.NEGATIVE_INFINITY;
        for (let i = 1; i < scores.length; i++) {
            if (scores[i] > bestScore) {
                bestScore = scores[i];
                bestAction = i;
            }
        }
        return bestAction as RLAction;
    }

    public storeTransition(state: number[], action: RLAction, reward: number, nextState: number[], done: boolean): void {
        this.memory.push({
            state: this.normalizeState(state),
            action,
            reward,
            nextState: this.normalizeState(nextState),
            done,
        });
    }

    public update(): void {
        if (this.memory.length === 0) return;

        for (const transition of this.memory) {
            const currentValue = this.dot(this.valueWeights, transition.state);
            const nextValue = transition.done ? 0 : this.dot(this.valueWeights, transition.nextState);
            const advantage = transition.reward + 0.99 * nextValue - currentValue;

            for (let i = 0; i < this.stateSpace; i++) {
                this.policyWeights[transition.action][i] += this.learningRate * advantage * transition.state[i];
                this.valueWeights[i] += this.learningRate * advantage * transition.state[i] * 0.5;
            }
        }

        this.memory.length = 0;
        this.epsilon = Math.max(0.01, this.epsilon * 0.999);
    }

    public getPolicySnapshot(): number[][] {
        return this.policyWeights.map((row) => [...row]);
    }

    private normalizeState(state: number[]): number[] {
        const clipped = state.slice(0, this.stateSpace).map((value) => {
            if (!Number.isFinite(value)) return 0;
            return Math.max(-10, Math.min(10, value));
        });
        while (clipped.length < this.stateSpace) {
            clipped.push(0);
        }
        return clipped;
    }

    private dot(a: number[], b: number[]): number {
        let sum = 0;
        for (let i = 0; i < Math.min(a.length, b.length); i++) {
            sum += a[i] * b[i];
        }
        return sum;
    }
}
