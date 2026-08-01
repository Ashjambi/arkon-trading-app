import { AppConfig, MarketAnalysisState, StrategyType } from '../types';
import { BacktestEngine, BacktestExecutionConfig, BacktestResult, BacktestStrategy, OHLCV } from './BacktestEngine';
import { getStrategyInstance } from './strategies/StrategyRegistry';
import { calculateFisherTransform, calculateGarmanKlassVolatility, calculateHurst, calculateVWAP, calculateVWAPBands } from './trading/indicators';

const average = (values: number[]): number => {
    if (values.length === 0) return 0;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
};

const standardDeviation = (values: number[]): number => {
    if (values.length < 2) return 0;
    const avg = average(values);
    const variance = values.reduce((sum, value) => sum + Math.pow(value - avg, 2), 0) / (values.length - 1);
    return Math.sqrt(Math.max(variance, 0));
};

const buildCandleSeries = (history: OHLCV[]) => ({
    status: 'ok',
    open: history.map((item) => Number(item.open || 0)),
    high: history.map((item) => Number(item.high || 0)),
    low: history.map((item) => Number(item.low || 0)),
    close: history.map((item) => Number(item.close || 0)),
    volume: history.map((item) => Number(item.volume || 0)),
    ticks: history.map((item) => Number(item.timestamp || 0)),
});

const calculateRSquared = (values: number[]): number => {
    if (values.length < 2) return 0;
    const xs = values.map((_, index) => index + 1);
    const avgX = average(xs);
    const avgY = average(values);

    let numerator = 0;
    let denominatorX = 0;
    let denominatorY = 0;

    for (let i = 0; i < values.length; i++) {
        const dx = xs[i] - avgX;
        const dy = values[i] - avgY;
        numerator += dx * dy;
        denominatorX += dx * dx;
        denominatorY += dy * dy;
    }

    if (denominatorX === 0 || denominatorY === 0) return 0;
    const correlation = numerator / Math.sqrt(denominatorX * denominatorY);
    return Math.max(0, Math.min(1, correlation * correlation));
};

const buildMarketStateFromCandle = (asset: string, candle: OHLCV, history: OHLCV[]): MarketAnalysisState => {
    const series = buildCandleSeries(history);
    const closes = series.close.filter((value) => Number.isFinite(value) && value > 0);
    const highs = series.high;
    const lows = series.low;
    const opens = series.open;
    const volumes = series.volume;
    const recent = closes.slice(-20);
    const first = recent[0] ?? candle.close;
    const last = recent[recent.length - 1] ?? candle.close;
    const trendDirection: 'UP' | 'DOWN' | 'NEUTRAL' = last > first ? 'UP' : last < first ? 'DOWN' : 'NEUTRAL';
    const avg = recent.length > 0 ? recent.reduce((sum, value) => sum + value, 0) / recent.length : candle.close;
    const vwapMain = calculateVWAP(series as any);
    const vwapBands = calculateVWAPBands(series as any);
    const fisherSeries = calculateFisherTransform(closes, 10);
    const fisher = fisherSeries[fisherSeries.length - 1] ?? 0;
    const hurst = calculateHurst(closes);
    const rSquared = calculateRSquared(recent);
    const priceStdDev = standardDeviation(recent);
    const vwapDeviation = vwapMain !== 0 ? (candle.close - vwapMain) / vwapMain : 0;
    const vwapZScore = priceStdDev > 0 ? (candle.close - avg) / priceStdDev : 0;
    const gkVolatility = opens.length >= 14 && highs.length >= 14 && lows.length >= 14 && closes.length >= 14
        ? calculateGarmanKlassVolatility(opens, highs, lows, closes, 14)
        : 0;
    const recentVolumes = volumes.slice(-20);
    const avgRecentVolume = average(recentVolumes);
    const volRatio = avgRecentVolume > 0 ? Number(candle.volume || 0) / avgRecentVolume : 1;
    const rangeNow = Math.max(0, Number(candle.high || candle.close) - Number(candle.low || candle.close));
    const avgRange = average(history.slice(-14).map((item) => Math.max(0, Number(item.high || item.close) - Number(item.low || item.close))));
    const dvol = avgRange > 0 ? (rangeNow / avgRange) * 100 : Number(candle.volume || 0);
    const liquidityGap = avg !== 0 ? (candle.close - avg) / avg : 0;
    const toxicityScore = Math.max(0, Math.min(1, gkVolatility * 10));
    const regime = gkVolatility > 0.03
        ? 'HIGH_VOLATILITY'
        : Math.abs((last - first) / Math.max(first, 0.000001)) > 0.02
            ? 'MOMENTUM_TREND'
            : Math.abs(vwapDeviation) > 0.01 && hurst < 0.48
                ? 'MEAN_REVERSION'
                : 'CHOPPY/NOISE';
    const pricePositionRank = (() => {
        const window = closes.slice(-50);
        if (window.length === 0) return 50;
        const low = Math.min(...window);
        const high = Math.max(...window);
        if (high === low) return 50;
        return ((candle.close - low) / (high - low)) * 100;
    })();
    const qualityScore = Math.max(0, Math.min(100,
        40 +
        Math.min(20, rSquared * 20) +
        Math.min(20, Math.abs(fisher) * 10) +
        Math.min(10, Math.abs(vwapDeviation) * 500) +
        Math.min(10, volRatio * 5) -
        Math.min(20, toxicityScore * 20)
    ));

    return {
        asset,
        price: Number(candle.close || 0),
        fisher,
        vwapDeviation,
        vwapZScore,
        vwapMain,
        vwapUpper: vwapBands.vwapUpper,
        vwapLower: vwapBands.vwapLower,
        volatility: Math.max(0, gkVolatility * Number(candle.close || 0)),
        bullishSweep: false,
        bearishSweep: false,
        swingLow: Number(candle.low || candle.close),
        swingHigh: Number(candle.high || candle.close),
        rSquared,
        dvol,
        hurst,
        volRatio,
        yearlyHigh: Math.max(...closes.slice(-252), Number(candle.high || candle.close)),
        yearlyLow: Math.min(...closes.slice(-252), Number(candle.low || candle.close)),
        pricePositionRank,
        regime,
        qualityScore,
        primaryBlocker: '',
        isCooldownActive: false,
        cooldownRemaining: 0,
        isCorrelatedBlocked: false,
        liquidityGap,
        toxicityScore,
        estimatedSlippage: 0,
        dataLatencyMs: 0,
        scoreBreakdown: [],
        dominantFactor: 'BACKTEST',
        reversalProbability: 0,
        trendDirection,
        fundingRate: 0,
        openInterest: 0,
        isNewsPaused: false,
        isDailyLossPaused: false,
        mtfStatus: {
            dailyTrend: trendDirection,
            h4Regime: regime,
            m15Trigger: trendDirection !== 'NEUTRAL',
        },
    };
};

export class StrategyBacktestAdapter {
    constructor(private readonly engine: BacktestEngine = new BacktestEngine()) {}

    public async runStrategyBacktest(
        strategyType: StrategyType,
        asset: string,
        data: OHLCV[],
        config: AppConfig,
        initialCapital: number,
        startDate: Date,
        endDate: Date,
        execution: BacktestExecutionConfig = {}
    ): Promise<BacktestResult> {
        const strategyInstance = getStrategyInstance(strategyType);
        if (!strategyInstance) {
            throw new Error(`Strategy ${strategyType} is not registered`);
        }

        const backtestStrategy: BacktestStrategy = {
            generateSignal: (candle, trades, index, fullData) => {
                const history = fullData.slice(0, index + 1);
                const marketState = buildMarketStateFromCandle(asset, candle, history);
                const validation = strategyInstance.validate(marketState, config);
                if (!validation.passed) return null;

                const signal = strategyInstance.execute(marketState, config);
                if (!signal) return null;

                return {
                    direction: signal.direction === 'SHORT' ? 'SHORT' : 'LONG',
                    size: Number(signal.recommendedSize || 1),
                    stopLoss: Number(signal.stopLoss || 0) || undefined,
                    takeProfit: Number(signal.takeProfit || 0) || undefined,
                    confidence: Number(signal.qualityScore || validation.score || 0),
                };
            },
        };

        return this.engine.runBacktest(backtestStrategy, data, initialCapital, startDate, endDate, execution);
    }
}

export const strategyBacktestAdapter = new StrategyBacktestAdapter();
