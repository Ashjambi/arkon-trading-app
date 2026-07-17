export type RouteHint = 'PRIMARY' | 'SECONDARY' | 'DARK' | 'INTERNAL';

export type RoutingContext = {
  symbol: string;
  instrumentType: 'EQUITY' | 'FUTURE' | 'FX' | 'CRYPTO';
  notional: number;
  executionStyle: 'AGGRESSIVE' | 'MID' | 'PASSIVE';
  liquidityTier?: 'HIGH' | 'MEDIUM' | 'LOW';
};

class SmartOrderRouterServiceImpl {
    decideRoute(context: RoutingContext): RouteHint {
        const liquidityTier = context.liquidityTier || 'HIGH';

        // 6) Optional DARK route
        if (context.instrumentType === 'EQUITY' && context.notional > 100000 && 
            (context.executionStyle === 'MID' || context.executionStyle === 'PASSIVE')) {
            return 'DARK';
        }

        if (context.executionStyle === 'AGGRESSIVE') {
            if (liquidityTier === 'HIGH') {
                return 'PRIMARY';
            } else {
                return 'SECONDARY';
            }
        }

        if (context.executionStyle === 'PASSIVE') {
            return 'PRIMARY';
        }

        if (context.executionStyle === 'MID') {
            if (liquidityTier === 'HIGH') {
                return 'PRIMARY';
            } else {
                return 'SECONDARY';
            }
        }

        return 'PRIMARY';
    }
}

export const smartOrderRouterService = new SmartOrderRouterServiceImpl();
