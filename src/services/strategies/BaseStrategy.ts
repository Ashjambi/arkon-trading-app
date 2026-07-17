import { TradingSignal, MarketAnalysisState, AppConfig } from '../../types';

export interface BaseStrategy {
    validate(state: MarketAnalysisState, config: AppConfig): { passed: boolean, score: number, reason?: string };
    execute(state: MarketAnalysisState, config: AppConfig): TradingSignal | null;
}
