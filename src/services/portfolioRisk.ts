import { TradingSignal, SignalDirection } from '../types';

export interface PortfolioRisk {
    totalExposure: number;
    correlationRisk: number;
    isSafeToTrade: boolean;
    reason?: string;
    suggestedLotMultiplier: number;
}

export const checkPortfolioRisk = (managedTrades: any[], newSignal: TradingSignal, maxOpenTrades: number, accountEquity: number = 1000, marginLevelPercent: number = 1000): PortfolioRisk => {
    const totalExposure = managedTrades.length;
    
    // 1. Anti-Margin Call (Black Swan Protection)
    // If the account's margin level drops below 300%, we STOP all new entries completely.
    if (marginLevelPercent > 0 && marginLevelPercent < 300) {
         return { totalExposure, correlationRisk: 1.0, isSafeToTrade: false, reason: `CRITICAL_MARGIN_LEVEL: Margin Level at ${marginLevelPercent.toFixed(1)}%. Trading suspended to prevent Margin Call.`, suggestedLotMultiplier: 0 };
    }

    if (totalExposure >= maxOpenTrades) {
        return { totalExposure, correlationRisk: 0, isSafeToTrade: false, reason: 'MAX_TRADES_REACHED', suggestedLotMultiplier: 0 };
    }

    // Calculate directional exposure
    let longExposure = 0;
    let shortExposure = 0;
    let totalDrawdown = 0;

    managedTrades.forEach(trade => {
        if (trade.type === 0 || trade.type === 'BUY' || trade.direction === SignalDirection.LONG) {
            longExposure++;
        } else if (trade.type === 1 || trade.type === 'SELL' || trade.direction === SignalDirection.SHORT) {
            shortExposure++;
        }
        if (trade.pnl && trade.pnl < 0) {
            totalDrawdown += Math.abs(trade.pnl);
        }
    });

    // 2. Dynamic Drawdown Circuit Breaker
    // If floating drawdown exceeds 15% of equity, we block new correlated entries.
    const drawdownPercent = (totalDrawdown / accountEquity) * 100;
    let lotMultiplier = 1.0;

    if (drawdownPercent > 15) {
        return { totalExposure, correlationRisk: 0.9, isSafeToTrade: false, reason: `HIGH_DRAWDOWN_PROTECTION: Drawdown is ${drawdownPercent.toFixed(2)}%. Preserving margin.`, suggestedLotMultiplier: 0 };
    } else if (drawdownPercent > 8) {
        lotMultiplier = 0.5; // Cut position size in half if drawdown is getting uncomfortable
    }

    // Check if we are adding to a heavily skewed portfolio (Increased to 70% to support larger grids like 5 out of 10)
    const newDirection = newSignal.direction;
    if (newDirection === SignalDirection.LONG && longExposure >= Math.max(3, Math.floor(maxOpenTrades * 0.7))) {
        return { totalExposure, correlationRisk: 0.8, isSafeToTrade: false, reason: 'EXCESSIVE_LONG_EXPOSURE', suggestedLotMultiplier: 0 };
    }
    if (newDirection === SignalDirection.SHORT && shortExposure >= Math.max(3, Math.floor(maxOpenTrades * 0.7))) {
        return { totalExposure, correlationRisk: 0.8, isSafeToTrade: false, reason: 'EXCESSIVE_SHORT_EXPOSURE', suggestedLotMultiplier: 0 };
    }

    // 3. Advanced Correlation Risk Engine (Avoid double exposure on highly correlated assets in the same direction)
    const cryptoAssets = ['BTC', 'ETH', 'BNB'];
    const usdQuoteAssets = ['EUR', 'GBP', 'AUD', 'NZD']; // Commonly correlated against USD
    
    const newAssetBase = newSignal.asset.split('-')[0].replace('USD', '').replace('USDT', '');
    
    // Check Crypto Correlation
    if (cryptoAssets.includes(newAssetBase) || newSignal.asset.includes('BTC') || newSignal.asset.includes('ETH')) {
        const correlatedTrades = managedTrades.filter(t => {
            const tAsset = t.asset || '';
            const isCrypto = cryptoAssets.some(c => tAsset.includes(c));
            const tDir = (t.type === 0 || t.type === 'BUY' || t.direction === SignalDirection.LONG) ? SignalDirection.LONG : SignalDirection.SHORT;
            // Ignore trades of the SAME asset for correlation calculation, because same-asset grids are allowed up to maxTradesPerWave
            const isSameAsset = tAsset.includes(newAssetBase) || newAssetBase.includes(tAsset);
            return isCrypto && tDir === newDirection && !isSameAsset;
        });
        
        // If we already have active trades in a DIFFERENT correlated crypto asset in the same direction, reduce lot size dynamically
        if (correlatedTrades.length >= 2) {
             return { totalExposure, correlationRisk: 0.9, isSafeToTrade: false, reason: 'HIGH_CORRELATION_RISK: Max Crypto exposure reached across different assets.', suggestedLotMultiplier: 0 };
        } else if (correlatedTrades.length === 1) {
             lotMultiplier *= 0.5; // Scale down
        }
    }

    // Check Major FX Correlation against USD
    const isUsdQuote = usdQuoteAssets.includes(newAssetBase) || newSignal.asset.endsWith('USD');
    if (isUsdQuote && !cryptoAssets.includes(newAssetBase)) {
        const correlatedTrades = managedTrades.filter(t => {
            const tAsset = t.asset || '';
            const isTUsdQuote = usdQuoteAssets.some(c => tAsset.includes(c)) || (tAsset.endsWith('USD') && !cryptoAssets.some(c => tAsset.includes(c)));
            const tDir = (t.type === 0 || t.type === 'BUY' || t.direction === SignalDirection.LONG) ? SignalDirection.LONG : SignalDirection.SHORT;
            return isTUsdQuote && tDir === newDirection;
        });

        // Limit to max 2 correlated FX pairs in the same direction to prevent excessive USD exposure
        if (correlatedTrades.length >= 2) {
             return { totalExposure, correlationRisk: 0.85, isSafeToTrade: false, reason: 'HIGH_CORRELATION_RISK: Excessive USD quote exposure', suggestedLotMultiplier: 0 };
        } else if (correlatedTrades.length === 1) {
             lotMultiplier *= 0.7; // Scale down slightly
        }
    }

    return {
        totalExposure,
        correlationRisk: 0.1,
        isSafeToTrade: true,
        suggestedLotMultiplier: lotMultiplier
    };
};
