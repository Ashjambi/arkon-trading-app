import { OHLCV } from '../BacktestEngine';
import { PPOAgent } from './PPOAgent';
import { TradingEnvironment } from './TradingEnvironment';

export interface TradingRLAgentConfig {
    data: OHLCV[];
    stateSpace?: number;
    actionSpace?: number;
    learningRate?: number;
}

export interface TrainingEpisodeSummary {
    episode: number;
    totalReward: number;
}

export class TradingRLAgent {
    public readonly env: TradingEnvironment;
    public readonly agent: PPOAgent;
    private lastTrainingSummaries: TrainingEpisodeSummary[] = [];

    constructor(config: TradingRLAgentConfig) {
        const stateSpace = config.stateSpace ?? 50;
        const actionSpace = config.actionSpace ?? 5;
        const learningRate = config.learningRate ?? 3e-4;

        this.env = new TradingEnvironment({
            data: config.data,
            stateSpace,
        });
        this.agent = new PPOAgent({
            stateSpace,
            actionSpace,
            learningRate,
        });
    }

    public train(episodes: number = 10000): TrainingEpisodeSummary[] {
        const summaries: TrainingEpisodeSummary[] = [];

        for (let episode = 0; episode < episodes; episode++) {
            let state = this.env.reset();
            let done = false;
            let totalReward = 0;

            while (!done) {
                const action = this.agent.selectAction(state);
                const { nextState, reward, done: nextDone } = this.env.step(action);
                this.agent.storeTransition(state, action, reward, nextState, nextDone);
                state = nextState;
                totalReward += reward;
                done = nextDone;
            }

            this.agent.update();
            summaries.push({ episode, totalReward });

            if (episode % 100 === 0) {
                console.log(`Episode ${episode}, Reward: ${totalReward.toFixed(2)}`);
            }
        }

        this.lastTrainingSummaries = summaries;
        return summaries;
    }

    public getTrainingSnapshot() {
        return {
            summaries: [...this.lastTrainingSummaries],
            policy: this.agent.getPolicySnapshot(),
        };
    }

    public getLivePolicyHint() {
        return this.getTrainingSnapshot();
    }
}
