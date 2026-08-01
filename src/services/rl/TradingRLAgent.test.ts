import { describe, expect, it } from 'vitest';
import { TradingRLAgent } from './TradingRLAgent';

describe('TradingRLAgent', () => {
    const data = Array.from({ length: 80 }, (_, index) => ({
        timestamp: index,
        open: 100 + index,
        high: 101 + index,
        low: 99 + index,
        close: 100 + index + Math.sin(index / 5),
        volume: 1000 + index * 10,
    }));

    it('trains for a few episodes and returns summaries', () => {
        const rlAgent = new TradingRLAgent({ data, stateSpace: 20, actionSpace: 5, learningRate: 1e-3 });
        const summaries = rlAgent.train(5);

        expect(summaries).toHaveLength(5);
        expect(typeof summaries[0].totalReward).toBe('number');
    });

    it('exposes environment and policy objects', () => {
        const rlAgent = new TradingRLAgent({ data });
        expect(rlAgent.env).toBeDefined();
        expect(rlAgent.agent).toBeDefined();
        expect(rlAgent.agent.getPolicySnapshot().length).toBe(5);
    });
});
