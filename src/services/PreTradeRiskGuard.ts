import { logStructured } from '../utils/logger';
import { tradingControlService } from './TradingControlService';
import { riskLimitsService } from './RiskLimitsService';
import { crossAssetCorrelationService } from './CrossAssetCorrelationService';

export type PreTradeRiskSnapshot = {
  maxNotionalPerOrder: number;
  maxSizePerOrder: number;
  maxPriceDeviationPct: number;
  maxOrdersPerWindow: number;
  windowMs: number;
  staleDataMaxAgeMs: number;

  currentWindowCount: number;
  windowStartTs: number | null;

  lastDecision:
    | 'ALLOWED'
    | 'BLOCKED_NOTIONAL'
    | 'BLOCKED_SIZE'
    | 'BLOCKED_PRICE_DEVIATION'
    | 'BLOCKED_THROTTLE'
    | 'BLOCKED_STALE_DATA'
    | 'BLOCKED_CONTROL_LAYER'
    | 'BLOCKED_EXPOSURE'
    | 'BLOCKED_TAIL_RISK'
    | 'BLOCKED_CORRELATION'
    | null;

  lastReason: string | null;
  lastCheckedAt: string | null;
};

export interface OrderCandidate {
    symbol: string;
    side: string;
    size: number;
    notional: number;
    price: number;
    referencePrice: number;
    timestamp: number;
    isRiskReducing?: boolean;
    tailRiskClamp?: boolean;
    cvarUsed?: number;
    realizedVolatilityUsed?: number;
}

export interface RiskContext {
    lastMarketDataTs: number | null;
    existingPositions?: Array<{ asset: string; direction: string; size: number }>;
}

export interface RiskGuardResult {
    allowed: boolean;
    reason?: string;
    decisionCode: string;
}

export class PreTradeRiskGuard {
    private snapshot: PreTradeRiskSnapshot;

    constructor() {
        this.snapshot = {
            maxNotionalPerOrder: 500000,
            maxSizePerOrder: 100,
            maxPriceDeviationPct: 0.05,
            maxOrdersPerWindow: 10,
            windowMs: 10000,
            staleDataMaxAgeMs: 30000,
            currentWindowCount: 0,
            windowStartTs: null,
            lastDecision: null,
            lastReason: null,
            lastCheckedAt: null,
        };
    }

    public getSnapshot(): PreTradeRiskSnapshot {
        return JSON.parse(JSON.stringify(this.snapshot));
    }

    public evaluate(candidate: OrderCandidate, context: RiskContext): RiskGuardResult {
        const now = Date.now();
        this.snapshot.lastCheckedAt = new Date(now).toISOString();

        // 5) TradingControlService check (per-asset context)
        const controlState = tradingControlService.evaluateControlState(candidate.symbol);
        if (controlState === 'BLOCKED') {
            return this.reject('BLOCKED_CONTROL_LAYER', `TradingControlService reports BLOCKED state for ${candidate.symbol}`);
        }

        // 4) Stale Market Data
        if (context.lastMarketDataTs === null) {
            return this.reject('BLOCKED_STALE_DATA', 'No market data timestamp provided');
        }
        if (now - context.lastMarketDataTs > this.snapshot.staleDataMaxAgeMs) {
            return this.reject('BLOCKED_STALE_DATA', `Market data is stale (>${this.snapshot.staleDataMaxAgeMs}ms)`);
        }

        // 3) Throttling
        if (this.snapshot.windowStartTs === null || now - this.snapshot.windowStartTs > this.snapshot.windowMs) {
            this.snapshot.windowStartTs = now;
            this.snapshot.currentWindowCount = 0;
        }
        this.snapshot.currentWindowCount++;
        
        if (this.snapshot.currentWindowCount > this.snapshot.maxOrdersPerWindow) {
            return this.reject('BLOCKED_THROTTLE', `Max orders per window exceeded (${this.snapshot.maxOrdersPerWindow})`);
        }

        // 1) Notional and Size
        if (candidate.notional > this.snapshot.maxNotionalPerOrder) {
            return this.reject('BLOCKED_NOTIONAL', `Notional ${candidate.notional.toFixed(2)} exceeds max ${this.snapshot.maxNotionalPerOrder}`);
        }
        if (candidate.size > this.snapshot.maxSizePerOrder) {
            return this.reject('BLOCKED_SIZE', `Size ${candidate.size.toFixed(4)} exceeds max ${this.snapshot.maxSizePerOrder}`);
        }

        // 2) Price Deviation
        if (candidate.referencePrice > 0) {
            const deviation = Math.abs(candidate.price - candidate.referencePrice) / candidate.referencePrice;
            if (deviation > this.snapshot.maxPriceDeviationPct) {
                return this.reject('BLOCKED_PRICE_DEVIATION', `Price deviation ${(deviation * 100).toFixed(2)}% exceeds max ${(this.snapshot.maxPriceDeviationPct * 100).toFixed(2)}%`);
            }
        }

        
        if (candidate.tailRiskClamp) {
            return this.reject('BLOCKED_TAIL_RISK', `Quantitative tail-risk clamp triggered (CVaR=${(candidate.cvarUsed ?? 0).toFixed(3)}, RV=${(candidate.realizedVolatilityUsed ?? 0).toFixed(3)})`);
        }

        // 6) Cross-Asset Correlation Check
        // If existing positions in other assets are highly correlated (|corr| > 0.95)
        // in the same direction, block the trade to prevent risk stacking.
        if (!candidate.isRiskReducing && context.existingPositions && context.existingPositions.length > 0) {
            const candidateSide = candidate.side === 'BUY' || candidate.side === 'ENTRY' || candidate.side === 'LONG' ? 'LONG' : 'SHORT';
            const blockResult = crossAssetCorrelationService.shouldBlockForCorrelation(
                candidate.symbol,
                candidateSide,
                context.existingPositions,
                60
            );
            if (blockResult.blocked) {
                return this.reject('BLOCKED_CORRELATION', blockResult.reason || 'Extreme cross-asset correlation detected');
            }
        }

        // Exposure Limits Check (Only for ENTRY orders)
        if (!candidate.isRiskReducing) {
            const limitsResult = riskLimitsService.isEntryAllowed(candidate.symbol, candidate.notional, candidate.size);
            if (!limitsResult.allowed) {
                return this.reject('BLOCKED_EXPOSURE', limitsResult.reason || 'Exposure limit breached');
            }
        }
    
        // Allowed
        this.snapshot.lastDecision = 'ALLOWED';
        this.snapshot.lastReason = 'All pre-trade risk checks passed';
        return { allowed: true, decisionCode: 'ALLOWED', reason: this.snapshot.lastReason };
    }

    private reject(decisionCode: PreTradeRiskSnapshot['lastDecision'], reason: string): RiskGuardResult {
        this.snapshot.lastDecision = decisionCode;
        this.snapshot.lastReason = reason;
        
        logStructured('SYSTEM', 'WARN', 'pre_trade_block', `Pre-trade blocked: ${decisionCode} - ${reason}`, {
            decisionCode,
            reason
        });

        return {
            allowed: false,
            decisionCode: decisionCode as string,
            reason
        };
    }
}

export const preTradeRiskGuard = new PreTradeRiskGuard();
