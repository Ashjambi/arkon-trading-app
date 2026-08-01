export type AssetVolatility = 'VERY_HIGH' | 'HIGH' | 'MEDIUM' | 'LOW' | 'STABLE';

export interface SupportedAsset {
    symbol: string;
    weight: number;
    volatility: AssetVolatility;
}

export interface AssetAllocation {
    symbol: string;
    valueUSD: number;
}

export interface RebalanceOrder {
    symbol: string;
    action: 'BUY' | 'SELL';
    quantity: number;
    notionalUSD: number;
    targetWeight: number;
    currentWeight: number;
    deltaWeight: number;
    reason: string;
}

export interface MultiAssetManagerOptions {
    minRebalanceDiffPct?: number;
    minOrderNotionalUSD?: number;
}

export type PriceProvider = () => Promise<Record<string, number>>;
export type AllocationProvider = () => Promise<AssetAllocation[]>;

export class MultiAssetManager {
    private readonly supportedAssets: SupportedAsset[] = [
        { symbol: 'BTCUSD', weight: 0.30, volatility: 'HIGH' },
        { symbol: 'ETHUSD', weight: 0.25, volatility: 'HIGH' },
        { symbol: 'SOLUSD', weight: 0.15, volatility: 'VERY_HIGH' },
        { symbol: 'XRPUSD', weight: 0.10, volatility: 'MEDIUM' },
        { symbol: 'GOLD', weight: 0.10, volatility: 'LOW' },
        { symbol: 'USDT', weight: 0.10, volatility: 'STABLE' },
    ];

    private readonly targetAllocations: Record<string, number>;
    private readonly minRebalanceDiffPct: number;
    private readonly minOrderNotionalUSD: number;

    constructor(
        private readonly priceProvider: PriceProvider,
        private readonly allocationProvider: AllocationProvider,
        options: MultiAssetManagerOptions = {}
    ) {
        this.targetAllocations = this.normalizeTargetWeights(this.supportedAssets);
        this.minRebalanceDiffPct = Math.max(0, Number(options.minRebalanceDiffPct ?? 0.005));
        this.minOrderNotionalUSD = Math.max(0, Number(options.minOrderNotionalUSD ?? 10));
    }

    public getSupportedAssets(): SupportedAsset[] {
        return [...this.supportedAssets];
    }

    public getTargetAllocations(): Record<string, number> {
        return { ...this.targetAllocations };
    }

    public async rebalancePortfolio(): Promise<RebalanceOrder[]> {
        const currentPrices = await this.getAllPrices();
        const currentAllocations = await this.getCurrentAllocations();

        return this.calculateRebalancingTrades(
            currentAllocations,
            this.targetAllocations,
            currentPrices
        );
    }

    public async getAllPrices(): Promise<Record<string, number>> {
        const prices = await this.priceProvider();
        const normalized: Record<string, number> = {};

        for (const asset of this.supportedAssets) {
            if (asset.symbol === 'USDT') {
                normalized.USDT = 1;
                continue;
            }

            const px = Number(prices[asset.symbol]);
            if (!Number.isFinite(px) || px <= 0) {
                throw new Error(`Missing or invalid price for ${asset.symbol}`);
            }
            normalized[asset.symbol] = px;
        }

        return normalized;
    }

    public async getCurrentAllocations(): Promise<AssetAllocation[]> {
        const allocations = await this.allocationProvider();
        const bySymbol = new Map<string, number>();

        for (const item of allocations || []) {
            const symbol = String(item?.symbol || '').toUpperCase();
            if (!symbol) continue;
            const valueUSD = Math.max(0, Number(item?.valueUSD || 0));
            bySymbol.set(symbol, (bySymbol.get(symbol) || 0) + valueUSD);
        }

        for (const asset of this.supportedAssets) {
            if (!bySymbol.has(asset.symbol)) {
                bySymbol.set(asset.symbol, 0);
            }
        }

        return Array.from(bySymbol.entries()).map(([symbol, valueUSD]) => ({ symbol, valueUSD }));
    }

    public calculateRebalancingTrades(
        currentAllocations: AssetAllocation[],
        targetAllocations: Record<string, number>,
        currentPrices: Record<string, number>
    ): RebalanceOrder[] {
        const supportedSymbols = new Set(this.supportedAssets.map((a) => a.symbol));

        const currentBySymbol = new Map<string, number>();
        for (const row of currentAllocations) {
            const symbol = String(row.symbol || '').toUpperCase();
            if (!supportedSymbols.has(symbol)) continue;
            const valueUSD = Math.max(0, Number(row.valueUSD || 0));
            currentBySymbol.set(symbol, (currentBySymbol.get(symbol) || 0) + valueUSD);
        }

        for (const symbol of supportedSymbols) {
            if (!currentBySymbol.has(symbol)) {
                currentBySymbol.set(symbol, 0);
            }
        }

        const totalValue = Array.from(currentBySymbol.values()).reduce((sum, v) => sum + v, 0);
        if (totalValue <= 0) return [];

        const orders: RebalanceOrder[] = [];

        for (const asset of this.supportedAssets) {
            const symbol = asset.symbol;
            const currentValue = currentBySymbol.get(symbol) || 0;
            const currentWeight = currentValue / totalValue;
            const targetWeight = Number(targetAllocations[symbol] || 0);
            const deltaWeight = targetWeight - currentWeight;

            if (Math.abs(deltaWeight) < this.minRebalanceDiffPct) continue;

            const targetValue = targetWeight * totalValue;
            const diffNotional = targetValue - currentValue;
            const absNotional = Math.abs(diffNotional);

            if (absNotional < this.minOrderNotionalUSD) continue;

            const price = symbol === 'USDT' ? 1 : Number(currentPrices[symbol]);
            if (!Number.isFinite(price) || price <= 0) {
                throw new Error(`Cannot compute quantity for ${symbol}: invalid price`);
            }

            const quantity = Number((absNotional / price).toFixed(6));
            if (quantity <= 0) continue;

            orders.push({
                symbol,
                action: diffNotional > 0 ? 'BUY' : 'SELL',
                quantity,
                notionalUSD: Number(absNotional.toFixed(2)),
                targetWeight,
                currentWeight,
                deltaWeight,
                reason: `REBALANCE_TO_TARGET_${(targetWeight * 100).toFixed(1)}PCT`,
            });
        }

        return orders.sort((a, b) => b.notionalUSD - a.notionalUSD);
    }

    private normalizeTargetWeights(assets: SupportedAsset[]): Record<string, number> {
        const total = assets.reduce((sum, a) => sum + Math.max(0, Number(a.weight || 0)), 0);
        if (total <= 0) {
            throw new Error('Invalid target weights: total weight must be > 0');
        }

        const out: Record<string, number> = {};
        for (const a of assets) {
            out[a.symbol] = Math.max(0, Number(a.weight || 0)) / total;
        }
        return out;
    }
}
