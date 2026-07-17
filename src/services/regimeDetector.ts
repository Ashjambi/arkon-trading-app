export type MarketRegime = 'MEAN_REVERSION' | 'MOMENTUM_TREND' | 'HIGH_VOLATILITY' | 'LOW_VOLATILITY' | 'CHOPPY/NOISE';

export const detectRegime = (
    dvol: number, 
    price: number, 
    dailySma50: number, 
    hurst: number = 0.5, 
    rSquared: number = 0
): MarketRegime => {
    // Institutional Regime Detection
    // DVOL typically ranges from 30 to 100+ for crypto.
    // For Gold, realized volatility might be lower (e.g., 10-20).
    
    // Trend vs Mean Reversion using Hurst and R-Squared
    // We check trend first because a strong trend can happen in high vol
    if (hurst > 0.55 && rSquared > 0.4) {
        return 'MOMENTUM_TREND';
    }
    
    if (hurst < 0.45) {
        return 'MEAN_REVERSION';
    }
    
    if (dvol > 75.0) return 'HIGH_VOLATILITY';
    if (dvol < 35.0) return 'LOW_VOLATILITY';
    
    return 'CHOPPY/NOISE';
};
