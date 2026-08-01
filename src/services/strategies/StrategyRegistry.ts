import { BaseStrategy } from "./BaseStrategy";
import { StrategyType } from "../../types";
import { BTCTrendStrategy } from "./BTC/BTC_TREND";
import { BTCMeanRevStrategy } from "./BTC/BTC_MEAN_REV";
import { BTCOFIStrategy } from "./BTC/BTC_OFI";
import { BTCAVRStrategy } from "./BTC/BTC_AVR";
import { BTCScalperStrategy } from "./BTC/BTC_SCALPER";
import { ETHTrendStrategy } from "./ETH/ETH_TREND";
import { ETHMeanRevStrategy } from "./ETH/ETH_MEAN_REV";
import { ETHCorrArbStrategy } from "./ETH/ETH_CORR_ARB";
import { ETHVolBreakStrategy } from "./ETH/ETH_VOL_BREAK";
import { ETHScalperStrategy } from "./ETH/ETH_SCALPER";
import { VolatilityBreakoutStrategy } from "./VolatilityBreakout";
import { CointegrationStrategy } from "./CointegrationStrategy";
import { NewsShockStrategy } from "./NewsShockStrategy";
import { MeanReversionAlphaStrategy } from './MeanReversionAlphaStrategy';
import { BreakoutCaptureStrategy } from './BreakoutCaptureStrategy';
import { ArbitrageScannerStrategy } from './ArbitrageScannerStrategy';
import { GridTradingStrategy } from './GridTradingStrategy';
import { GoldTrendStrategy } from './GOLD/GOLD_TREND';
import { GoldMeanRevStrategy } from './GOLD/GOLD_MEAN_REV';
import { GoldScalperStrategy } from './GOLD/GOLD_SCALPER';
import { SolTrendStrategy } from './SOL/SOL_TREND';
import { SolMeanRevStrategy } from './SOL/SOL_MEAN_REV';
import { SolScalperStrategy } from './SOL/SOL_SCALPER';

const strategyRegistry: Record<string, () => BaseStrategy> = {
    'BTC_TREND': () => new BTCTrendStrategy(),
    'BTC_MEAN_REV': () => new BTCMeanRevStrategy(),
    'BTC_OFI': () => new BTCOFIStrategy(),
    'BTC_AVR': () => new BTCAVRStrategy(),
    'BTC_SCALPER': () => new BTCScalperStrategy(),
    'ETH_TREND': () => new ETHTrendStrategy(),
    'ETH_MEAN_REV': () => new ETHMeanRevStrategy(),
    'ETH_CORR_ARB': () => new ETHCorrArbStrategy(),
    'ETH_VOL_BREAK': () => new ETHVolBreakStrategy(),
    'ETH_SCALPER': () => new ETHScalperStrategy(),
    'GOLD_TREND': () => new GoldTrendStrategy(),
    'GOLD_MEAN_REV': () => new GoldMeanRevStrategy(),
    'GOLD_SCALPER': () => new GoldScalperStrategy(),
    'SOL_TREND': () => new SolTrendStrategy(),
    'SOL_MEAN_REV': () => new SolMeanRevStrategy(),
    'SOL_SCALPER': () => new SolScalperStrategy(),
    'VOLATILITY_BREAKOUT': () => new VolatilityBreakoutStrategy(),
    'COINTEGRATION': () => new CointegrationStrategy(),
    'MEAN_REVERSION_ALPHA': () => new MeanReversionAlphaStrategy(),
    'BREAKOUT_CAPTURE': () => new BreakoutCaptureStrategy(),
    'ARBITRAGE_SCANNER': () => new ArbitrageScannerStrategy(),
    'GRID_TRADING': () => new GridTradingStrategy(),
    'NEWS_SHOCK': () => new NewsShockStrategy(),
};

export const getStrategyInstance = (type: StrategyType): BaseStrategy | null => {
    const factory = strategyRegistry[type];
    return factory ? factory() : null;
};
