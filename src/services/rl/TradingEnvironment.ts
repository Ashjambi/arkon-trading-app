import { OHLCV } from '../BacktestEngine';
import { RLAction } from './PPOAgent';

export interface TradingEnvironmentConfig {
    data: OHLCV[];
    stateSpace?: number;
    maxSteps?: number;
}

export interface StepInfo {
    step: number;
    price: number;
    position: -1 | 0 | 1;
    cash: number;
    equity: number;
}

export class TradingEnvironment {
    private readonly data: OHLCV[];
    private readonly stateSpace: number;
    private readonly maxSteps: number;
    private currentIndex = 0;
    private cash = 10000;
    private position: -1 | 0 | 1 = 0;
    private entryPrice = 0;
    private equity = 10000;

    constructor(config: TradingEnvironmentConfig) {
        this.data = config.data;
        this.stateSpace = config.stateSpace ?? 50;
        this.maxSteps = Math.min(config.maxSteps ?? this.data.length, this.data.length);
    }

    public reset(): number[] {
        this.currentIndex = Math.min(20, Math.max(0, this.data.length - 1));
        this.cash = 10000;
        this.position = 0;
        this.entryPrice = 0;
        this.equity = 10000;
        return this.getState();
    }

    public step(action: RLAction): { nextState: number[]; reward: number; done: boolean; info: StepInfo } {
        const candle = this.data[this.currentIndex];
        const price = Number(candle?.close || 0);
        const previousEquity = this.equity;

        if (action === 0) {
            this.openPosition(1, price);
        } else if (action === 1) {
            this.openPosition(-1, price);
        } else if (action === 3) {
            this.cash += this.position !== 0 ? this.markToMarket(price) * 0.25 : 0;
        } else if (action === 4) {
            this.openPosition(this.position === 1 ? -1 : 1, price);
        }

        this.currentIndex += 1;
        const done = this.currentIndex >= this.maxSteps - 1;
        const mark = this.markToMarket(price);
        this.equity = this.cash + mark;
        const reward = this.equity - previousEquity;

        return {
            nextState: this.getState(),
            reward,
            done,
            info: {
                step: this.currentIndex,
                price,
                position: this.position,
                cash: this.cash,
                equity: this.equity,
            },
        };
    }

    private openPosition(direction: -1 | 1, price: number): void {
        if (this.position !== 0 && this.position !== direction) {
            this.cash += this.markToMarket(price);
        }
        this.position = direction;
        this.entryPrice = price;
    }

    private markToMarket(price: number): number {
        if (this.position === 0 || this.entryPrice === 0) return 0;
        const pnl = this.position === 1 ? price - this.entryPrice : this.entryPrice - price;
        return pnl;
    }

    private getState(): number[] {
        const start = Math.max(0, this.currentIndex - this.stateSpace + 1);
        const window = this.data.slice(start, this.currentIndex + 1);
        const closes = window.map((item) => Number(item.close || 0));
        const volumes = window.map((item) => Number(item.volume || 0));
        const features: number[] = [];

        for (let i = 1; i < closes.length; i++) {
            const prev = closes[i - 1] || closes[i] || 1;
            features.push((closes[i] - prev) / prev);
        }
        for (let i = 1; i < volumes.length; i++) {
            const prev = volumes[i - 1] || volumes[i] || 1;
            features.push((volumes[i] - prev) / prev);
        }

        features.push(this.position);
        features.push(this.cash / 10000 - 1);
        features.push(this.equity / 10000 - 1);

        while (features.length < this.stateSpace) {
            features.push(0);
        }

        return features.slice(-this.stateSpace);
    }
}
