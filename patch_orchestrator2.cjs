const fs = require('fs');
let content = fs.readFileSync('src/services/ExecutionOrchestrator.ts', 'utf8');

const executePlanMethod = `
    public async executePlan(signals: any[], analysis: MarketAnalysisState, actionType: string = 'ENTRY', crlState: any = null): Promise<boolean> {
        let anySuccess = false;
        
        // 1. Read existing config / risk limits
        const asset = signals.length > 0 ? signals[0].asset : 'UNKNOWN';
        const snapshot = riskLimitsService.getSnapshot();
        const assetState = snapshot.assets[asset] || { openPositions: 0, currentExposure: 0 };
        
        const maxConcurrent = this.config.maxTradesPerWave || 1;
        const availableSlots = Math.max(0, maxConcurrent - assetState.openPositions);
        
        // 2. Build Execution Plan
        const signalsToExecute = signals.slice(0, availableSlots);
        
        if (signals.length > 0 && availableSlots === 0) {
            this.addLog(\`⛔ [EXECUTION PLAN] No available slots for \${asset} (max \${maxConcurrent}, open \${assetState.openPositions})\`, 'SYSTEM');
        }

        // 3. Iterate and execute
        for (let i = 0; i < signalsToExecute.length; i++) {
            const signal = signalsToExecute[i];
            
            // Distribute lot size so total exposure stays within limits
            const baseLotSize = asset.includes('BTC') ? this.config.fixedLotSizeBTC : this.config.fixedLotSizeETH;
            const originalLotSize = signal.recommendedSize || baseLotSize;
            
            // Just basic distribution: divide the intended single-trade exposure among the parallel signals
            signal.recommendedSize = originalLotSize / signalsToExecute.length;
            
            const success = await this.executeSignal(signal, analysis, actionType, crlState);
            if (success) anySuccess = true;
        }
        
        return anySuccess;
    }
`;

content = content.replace(
  "public async executeSignal(",
  executePlanMethod + "\n    public async executeSignal("
);

fs.writeFileSync('src/services/ExecutionOrchestrator.ts', content);
