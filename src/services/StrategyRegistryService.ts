export type StrategyMetadata = {
    strategyId: string;
    style: string;
    assetScope: string[];
    enabled: boolean;
    priorityWeight: number;
    thematicGroup: string;
};

export class StrategyRegistryService {
    private strategies: Map<string, StrategyMetadata> = new Map();

    constructor() {
        this.initializeRegistry();
    }

    private initializeRegistry() {
        this.register({ strategyId: 'BTC_TREND', style: 'Trend Following', assetScope: ['BTC-PERPETUAL'], enabled: true, priorityWeight: 1, thematicGroup: 'Momentum' });
        this.register({ strategyId: 'BTC_MEAN_REV', style: 'Mean Reversion', assetScope: ['BTC-PERPETUAL'], enabled: true, priorityWeight: 1, thematicGroup: 'Mean Reversion' });
        this.register({ strategyId: 'BTC_OFI', style: 'Order Flow Imbalance', assetScope: ['BTC-PERPETUAL'], enabled: true, priorityWeight: 1, thematicGroup: 'Microstructure' });
        this.register({ strategyId: 'BTC_AVR', style: 'Average True Range', assetScope: ['BTC-PERPETUAL'], enabled: true, priorityWeight: 1, thematicGroup: 'Volatility' });
        this.register({ strategyId: 'BTC_SCALPER', style: 'Scalping', assetScope: ['BTC-PERPETUAL'], enabled: true, priorityWeight: 1, thematicGroup: 'Scalping' });
        
        this.register({ strategyId: 'ETH_TREND', style: 'Trend Following', assetScope: ['ETH-PERPETUAL'], enabled: true, priorityWeight: 1, thematicGroup: 'Momentum' });
        this.register({ strategyId: 'ETH_MEAN_REV', style: 'Mean Reversion', assetScope: ['ETH-PERPETUAL'], enabled: true, priorityWeight: 1, thematicGroup: 'Mean Reversion' });
        this.register({ strategyId: 'ETH_CORR_ARB', style: 'Correlation Arbitrage', assetScope: ['ETH-PERPETUAL', 'BTC-PERPETUAL'], enabled: true, priorityWeight: 1, thematicGroup: 'Arbitrage' });
        this.register({ strategyId: 'ETH_VOL_BREAK', style: 'Volatility Breakout', assetScope: ['ETH-PERPETUAL'], enabled: true, priorityWeight: 1, thematicGroup: 'Breakout' });
        this.register({ strategyId: 'ETH_SCALPER', style: 'Scalping', assetScope: ['ETH-PERPETUAL'], enabled: true, priorityWeight: 1, thematicGroup: 'Scalping' });

        this.register({ strategyId: 'VOLATILITY_BREAKOUT', style: 'Volatility Breakout', assetScope: ['BTC-PERPETUAL', 'ETH-PERPETUAL'], enabled: true, priorityWeight: 1, thematicGroup: 'Breakout' });
        this.register({ strategyId: 'COINTEGRATION', style: 'Statistical Arbitrage', assetScope: ['BTC-PERPETUAL', 'ETH-PERPETUAL'], enabled: true, priorityWeight: 1, thematicGroup: 'Arbitrage' });
        this.register({ strategyId: 'MEAN_REVERSION_ALPHA', style: 'Mean Reversion', assetScope: ['BTC-PERPETUAL', 'ETH-PERPETUAL'], enabled: true, priorityWeight: 1, thematicGroup: 'Mean Reversion' });
        this.register({ strategyId: 'BREAKOUT_CAPTURE', style: 'Breakout Capture', assetScope: ['BTC-PERPETUAL', 'ETH-PERPETUAL'], enabled: true, priorityWeight: 1, thematicGroup: 'Breakout' });
        this.register({ strategyId: 'ARBITRAGE_SCANNER', style: 'Arbitrage Scanner', assetScope: ['BTC-PERPETUAL', 'ETH-PERPETUAL'], enabled: true, priorityWeight: 1, thematicGroup: 'Arbitrage' });
        this.register({ strategyId: 'GRID_TRADING', style: 'Grid Trading', assetScope: ['BTC-PERPETUAL', 'ETH-PERPETUAL'], enabled: true, priorityWeight: 1, thematicGroup: 'Range' });
        this.register({ strategyId: 'NEWS_SHOCK', style: 'Event Driven', assetScope: ['BTC-PERPETUAL', 'ETH-PERPETUAL'], enabled: false, priorityWeight: 1, thematicGroup: 'News' });
    }

    private register(meta: StrategyMetadata) {
        this.strategies.set(meta.strategyId, meta);
    }

    public getEnabledStrategies(): StrategyMetadata[] {
        return Array.from(this.strategies.values()).filter(s => s.enabled);
    }

    public getStrategiesForAsset(symbol: string): StrategyMetadata[] {
        return Array.from(this.strategies.values()).filter(s => s.assetScope.includes(symbol));
    }

    public getStrategyMeta(strategyId: string): StrategyMetadata | null {
        return this.strategies.get(strategyId) || null;
    }
}

export const strategyRegistryService = new StrategyRegistryService();
