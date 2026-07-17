import { logStructured } from '../utils/logger';

export type AssetRiskLimits = {
  symbol: string;
  maxPositionSize: number;
  maxNotionalExposure: number;
};

export type GlobalRiskLimits = {
  maxOpenPositions: number;
  maxDailyLoss: number;
};

export type RiskLimitsSnapshot = {
  assets: AssetRiskLimits[];
  global: GlobalRiskLimits;
  currentExposureByAsset: Record<string, {
    positionSize: number;
    notionalExposure: number;
  }>;
  currentOpenPositions: number;
  currentDailyPnL: number;
  lastResetAt: string;
};

export interface RiskLimitEvaluation {
    allowed: boolean;
    reason?: string;
    code?: string;
}

export class RiskLimitsService {
    private snapshot: RiskLimitsSnapshot;

    constructor() {
        this.snapshot = this.getInitialSnapshot();
    }

    private getInitialSnapshot(): RiskLimitsSnapshot {
        return {
            assets: [
                { symbol: 'BTC-PERPETUAL', maxPositionSize: 10, maxNotionalExposure: 1000000 },
                { symbol: 'ETH-PERPETUAL', maxPositionSize: 100, maxNotionalExposure: 500000 }
            ],
            global: {
                maxOpenPositions: 5,
                maxDailyLoss: 10000
            },
            currentExposureByAsset: {},
            currentOpenPositions: 0,
            currentDailyPnL: 0,
            lastResetAt: new Date().toISOString()
        };
    }

    public getSnapshot(): RiskLimitsSnapshot {
        return JSON.parse(JSON.stringify(this.snapshot));
    }

    public isEntryAllowed(symbol: string, entryNotional: number, entrySize: number): RiskLimitEvaluation {
        // Global Daily Loss
        if (this.snapshot.currentDailyPnL <= -this.snapshot.global.maxDailyLoss) {
             return { allowed: false, reason: `Max daily loss exceeded (${this.snapshot.currentDailyPnL})`, code: 'BLOCKED_EXPOSURE' };
        }

        const exposure = this.snapshot.currentExposureByAsset[symbol] || { positionSize: 0, notionalExposure: 0 };
        const limits = this.snapshot.assets.find(a => a.symbol === symbol);

        if (limits) {
            if (exposure.positionSize + entrySize > limits.maxPositionSize) {
                return { allowed: false, reason: `Max position size exceeded for ${symbol}. Current: ${exposure.positionSize}, Entry: ${entrySize}, Max: ${limits.maxPositionSize}`, code: 'BLOCKED_EXPOSURE' };
            }
            if (exposure.notionalExposure + entryNotional > limits.maxNotionalExposure) {
                return { allowed: false, reason: `Max notional exposure exceeded for ${symbol}. Current: ${exposure.notionalExposure}, Entry: ${entryNotional}, Max: ${limits.maxNotionalExposure}`, code: 'BLOCKED_EXPOSURE' };
            }
        }

        // Global Open Positions (assuming a new position is opened if current is 0)
        if (exposure.positionSize === 0) {
            if (this.snapshot.currentOpenPositions >= this.snapshot.global.maxOpenPositions) {
                return { allowed: false, reason: `Max open positions limit reached (${this.snapshot.global.maxOpenPositions})`, code: 'BLOCKED_EXPOSURE' };
            }
        }

        return { allowed: true };
    }

    public registerExecutedOrder(symbol: string, side: string, size: number, notional: number, isRiskReducing: boolean): void {
        if (!this.snapshot.currentExposureByAsset[symbol]) {
            this.snapshot.currentExposureByAsset[symbol] = { positionSize: 0, notionalExposure: 0 };
        }

        const exposure = this.snapshot.currentExposureByAsset[symbol];
        
        if (isRiskReducing) {
            // Very naive approximation. A true system tracks absolute size.
            // If reducing risk, size should go towards zero, but never below zero.
            const newSize = exposure.positionSize - size;
            const newNotional = exposure.notionalExposure - notional;
            
            exposure.positionSize = Math.max(0, newSize);
            exposure.notionalExposure = Math.max(0, newNotional);
            
            if (exposure.positionSize === 0) {
                this.snapshot.currentOpenPositions = Math.max(0, this.snapshot.currentOpenPositions - 1);
            }
        } else {
            if (exposure.positionSize === 0) {
                this.snapshot.currentOpenPositions++;
            }
            exposure.positionSize += size;
            exposure.notionalExposure += notional;
        }

        logStructured('SYSTEM', 'INFO', 'risk_limits_updated', `Exposure updated for ${symbol}`, {
            symbol,
            side,
            isRiskReducing,
            newSize: exposure.positionSize,
            newNotional: exposure.notionalExposure,
            openPositions: this.snapshot.currentOpenPositions
        });
    }

    public resetDaily(): void {
        this.snapshot.currentDailyPnL = 0;
        this.snapshot.lastResetAt = new Date().toISOString();
        logStructured('SYSTEM', 'INFO', 'risk_limits_daily_reset', 'Daily limits reset completed');
    }
}

export const riskLimitsService = new RiskLimitsService();
