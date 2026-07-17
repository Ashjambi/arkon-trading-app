export type ParentOrder = {
  symbol: string;
  strategy: string;
  side: 'BUY' | 'SELL';
  totalSize: number;
  executionStyle: 'AGGRESSIVE' | 'MID' | 'PASSIVE';
  routeHint: 'PRIMARY' | 'SECONDARY' | 'DARK' | 'INTERNAL';
};

export type ChildOrder = {
  symbol: string;
  strategy: string;
  side: 'BUY' | 'SELL';
  size: number;
  executionStyle: 'AGGRESSIVE' | 'MID' | 'PASSIVE';
  routeHint: 'PRIMARY' | 'SECONDARY' | 'DARK' | 'INTERNAL';
  sliceIndex: number;
  totalSlices: number;
  dispatchMode?: 'immediate' | 'staggered';
  intervalMs?: number;
  scheduledAtOffsetMs?: number;
  timingPolicy?: 'sequential_immediate' | 'fixed_interval';
};

class ChildOrderSchedulerServiceImpl {
  private baseSliceSize = 1.0;

  schedule(parent: ParentOrder): ChildOrder[] {
    let numSlices = 1;

    if (parent.totalSize > this.baseSliceSize) {
      if (parent.executionStyle === 'AGGRESSIVE') {
        const baseSliceSizeAgg = 2.0;
        const maxAggressiveSlices = 3;
        numSlices = Math.min(maxAggressiveSlices, Math.ceil(parent.totalSize / baseSliceSizeAgg));
      } else if (parent.executionStyle === 'PASSIVE') {
        const baseSliceSizePassive = 1.0;
        const maxPassiveSlices = 10;
        numSlices = Math.min(maxPassiveSlices, Math.ceil(parent.totalSize / baseSliceSizePassive));
      } else if (parent.executionStyle === 'MID') {
        const baseSliceSizeMid = 1.5;
        const maxMidSlices = 5;
        numSlices = Math.min(maxMidSlices, Math.ceil(parent.totalSize / baseSliceSizeMid));
      }
    }

    // Ensure at least 1 slice
    numSlices = Math.max(1, numSlices);

    const baseSize = Math.floor((parent.totalSize / numSlices) * 1000) / 1000;
    const childOrders: ChildOrder[] = [];

    let accumulatedSize = 0;
    for (let i = 0; i < numSlices; i++) {
      let size = baseSize;
      
      // Give remainder to the last slice
      if (i === numSlices - 1) {
        size = Math.round((parent.totalSize - accumulatedSize) * 1000) / 1000;
      }
      
      childOrders.push({
        symbol: parent.symbol,
        strategy: parent.strategy,
        side: parent.side,
        size: size,
        executionStyle: parent.executionStyle,
        routeHint: parent.routeHint,
        sliceIndex: i,
        totalSlices: numSlices,
      });

      accumulatedSize += size;
    }

    return childOrders;
  }
}

export const childOrderSchedulerService = new ChildOrderSchedulerServiceImpl();
