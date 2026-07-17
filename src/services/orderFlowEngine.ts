import { AppConfig } from '../types';

export interface MarketData {
    buyVolume: number;
    sellVolume: number;
    askVolume: number;
    bidVolume: number;
    price: number;
    volume: number;
}

export const calculateOFI = (buyVolume: number, sellVolume: number): number => {
    if (buyVolume + sellVolume === 0) return 0;
    return (buyVolume - sellVolume) / (buyVolume + sellVolume);
};

export const detectImbalance = (askVolume: number, bidVolume: number, ratio: number): 'BUY' | 'SELL' | null => {
    if (bidVolume > 0 && askVolume / bidVolume >= ratio) return 'BUY';
    if (askVolume > 0 && bidVolume / askVolume >= ratio) return 'SELL';
    return null;
};

export const analyzeOrderFlow = (data: MarketData, config: AppConfig) => {
    const { ofiThreshold, imbalanceRatio, minVolume } = config.orderFlowConfig;
    
    if (data.volume < minVolume) return null;

    const ofi = calculateOFI(data.buyVolume, data.sellVolume);
    const imbalance = detectImbalance(data.askVolume, data.bidVolume, imbalanceRatio);

    // Strategy 2: Initiative Breakout (Simplified example)
    if (Math.abs(ofi) >= ofiThreshold && imbalance === 'BUY') {
        return 'BUY_SIGNAL';
    }
    if (Math.abs(ofi) >= ofiThreshold && imbalance === 'SELL') {
        return 'SELL_SIGNAL';
    }

    return null;
};
