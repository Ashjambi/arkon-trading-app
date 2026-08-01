import { TradingSignal, SignalDirection } from '../types';

export interface PositionReduction {
    ticket?: number | string;
    asset: string;
    direction: 'LONG' | 'SHORT';
    currentSize: number;
    suggestedReductionPct: number;
    estimatedMarginRelief: number;
    reason: string;
}

export interface MarginAlert {
    level: 'WARNING' | 'CRITICAL' | 'LIQUIDATION_IMMINENT';
    currentMargin: number;
    requiredAction: string;
    suggestedReductions: PositionReduction[];
}

export interface MarginAccountInfo {
    equity: number;
    margin: number;
}

export interface MarginMonitorContext {
    positions: any[];
    signal?: TradingSignal;
}

export class MarginMonitor {
    private readonly warningThreshold = 500;
    private readonly criticalThreshold = 300;
    private readonly liquidationThreshold = 150;

    async checkMarginLevels(
        account: MarginAccountInfo,
        context: MarginMonitorContext
    ): Promise<MarginAlert | null> {
        const equity = Math.max(0, Number(account?.equity || 0));
        const margin = Math.max(0.000001, Number(account?.margin || 0));
        const marginLevel = (equity / margin) * 100;

        if (marginLevel < this.liquidationThreshold) {
            return {
                level: 'LIQUIDATION_IMMINENT',
                currentMargin: marginLevel,
                requiredAction: 'IMMEDIATE_POSITION_REDUCTION',
                suggestedReductions: this.calculateOptimalReductions(context.positions, context.signal, marginLevel, 'LIQUIDATION_IMMINENT'),
            };
        }

        if (marginLevel < this.criticalThreshold) {
            return {
                level: 'CRITICAL',
                currentMargin: marginLevel,
                requiredAction: 'REDUCE_EXPOSURE',
                suggestedReductions: this.calculateOptimalReductions(context.positions, context.signal, marginLevel, 'CRITICAL'),
            };
        }

        if (marginLevel < this.warningThreshold) {
            return {
                level: 'WARNING',
                currentMargin: marginLevel,
                requiredAction: 'TIGHTEN_RISK_AND_REDUCE_SIZE',
                suggestedReductions: this.calculateOptimalReductions(context.positions, context.signal, marginLevel, 'WARNING'),
            };
        }

        return null;
    }

    private calculateOptimalReductions(
        positions: any[],
        signal: TradingSignal | undefined,
        marginLevel: number,
        level: MarginAlert['level']
    ): PositionReduction[] {
        if (!Array.isArray(positions) || positions.length === 0) return [];

        const isSignalLong = signal?.direction === SignalDirection.LONG;
        const isSignalShort = signal?.direction === SignalDirection.SHORT;

        const sorted = [...positions].sort((a, b) => {
            const aRisk = this.computePositionRiskScore(a, isSignalLong, isSignalShort);
            const bRisk = this.computePositionRiskScore(b, isSignalLong, isSignalShort);
            return bRisk - aRisk;
        });

        const targetCount = level === 'LIQUIDATION_IMMINENT' ? 4 : level === 'CRITICAL' ? 3 : 2;
        const baseReduction = level === 'LIQUIDATION_IMMINENT' ? 0.7 : level === 'CRITICAL' ? 0.45 : 0.25;

        return sorted.slice(0, Math.min(targetCount, sorted.length)).map((position) => {
            const currentSize = Math.max(0.01, Number(position.size || position.volume || position.lotSize || 0.01));
            const estimatedNotional = currentSize * Math.max(1, Number(position.entryPrice || position.openPrice || signal?.entry || 1));

            return {
                ticket: position.ticket,
                asset: String(position.asset || position.symbol || 'UNKNOWN'),
                direction: this.getDirection(position),
                currentSize,
                suggestedReductionPct: Number((baseReduction * 100).toFixed(1)),
                estimatedMarginRelief: Number((estimatedNotional * baseReduction).toFixed(2)),
                reason: `MARGIN_${level}`,
            };
        });
    }

    private getDirection(position: any): 'LONG' | 'SHORT' {
        const dir = String(position?.direction || position?.type || '').toUpperCase();
        if (dir === 'LONG' || dir === 'BUY' || dir === '0') return 'LONG';
        return 'SHORT';
    }

    private computePositionRiskScore(position: any, isSignalLong: boolean, isSignalShort: boolean): number {
        const pnl = Number(position?.pnl || position?.profit || 0);
        const size = Math.max(0.01, Number(position?.size || position?.volume || position?.lotSize || 0.01));
        const direction = this.getDirection(position);
        const adverseDirectionPenalty =
            (isSignalLong && direction === 'SHORT') || (isSignalShort && direction === 'LONG') ? 1.3 : 1.0;
        const lossPenalty = pnl < 0 ? Math.abs(pnl) : 0;
        return (size * 100 + lossPenalty) * adverseDirectionPenalty;
    }
}

export const marginMonitor = new MarginMonitor();
