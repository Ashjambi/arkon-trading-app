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
    'VOLATILITY_BREAKOUT': () => new VolatilityBreakoutStrategy(),
    'COINTEGRATION': () => new CointegrationStrategy(),
    'NEWS_SHOCK': () => new NewsShockStrategy(),
};

export const getStrategyInstance = (type: StrategyType): BaseStrategy | null => {
    const factory = strategyRegistry[type];
    return factory ? factory() : null;
};
