import { logStructured } from '../utils/logger';
import { riskLimitsService } from './RiskLimitsService';

export interface TradingControlSnapshot {
  manualKillSwitch: boolean;
  autoBlocked: boolean;
  reducedRiskMode: boolean;
  cooldownActive: boolean;
  cooldownUntil: string | null;
  lastBlockReason: string | null;
  lastMode: 'NORMAL' | 'REDUCED' | 'BLOCKED';
  recentTriggers: {
    degradedDataBursts: number;
    executionSkipBursts: number;
    executionDelayBursts: number;
    toxicityBursts: number;
  };
  thresholds: {
    maxSequentialSkips: number;
    maxSequentialDelays: number;
    maxDegradedDataEvents: number;
    cooldownMs: number;
  };
  updatedAt: string;
}

export class TradingControlService {
    private snapshot: TradingControlSnapshot;

    constructor() {
        this.snapshot = this.getInitialSnapshot();
    }

    private getInitialSnapshot(): TradingControlSnapshot {
        return {
            manualKillSwitch: false,
            autoBlocked: false,
            reducedRiskMode: false,
            cooldownActive: false,
            cooldownUntil: null,
            lastBlockReason: null,
            lastMode: 'NORMAL',
            recentTriggers: {
                degradedDataBursts: 0,
                executionSkipBursts: 0,
                executionDelayBursts: 0,
                toxicityBursts: 0,
            },
            thresholds: {
                maxSequentialSkips: 3,
                maxSequentialDelays: 5,
                maxDegradedDataEvents: 10,
                cooldownMs: 5 * 60 * 1000, // 5 minutes
            },
            updatedAt: new Date().toISOString()
        };
    }

    public getSnapshot(): TradingControlSnapshot {
        this.evaluateControlState(); // ensure cooldowns expire if time passed
        this.snapshot.updatedAt = new Date().toISOString();
        return JSON.parse(JSON.stringify(this.snapshot));
    }

    public setManualKillSwitch(active: boolean): void {
        this.snapshot.manualKillSwitch = active;
        this.snapshot.lastBlockReason = active ? 'Manual kill switch activated' : null;
        this.evaluateControlState();
        
        logStructured('SYSTEM', active ? 'WARN' : 'INFO', 'manual_kill_switch', `Kill switch is now ${active ? 'ON' : 'OFF'}`, {
            active
        });
    }

    public reset(): void {
        const killSwitch = this.snapshot.manualKillSwitch;
        this.snapshot = this.getInitialSnapshot();
        this.snapshot.manualKillSwitch = killSwitch; // keep kill switch state
        logStructured('SYSTEM', 'INFO', 'trading_control_reset', 'Trading control state has been reset');
    }

    public recordExecutionSkip(): void {
        this.snapshot.recentTriggers.executionSkipBursts++;
        this.snapshot.recentTriggers.executionDelayBursts = 0; // reset delay burst?
        this.evaluateControlState();
    }

    public recordExecutionDelay(): void {
        this.snapshot.recentTriggers.executionDelayBursts++;
        this.evaluateControlState();
    }

    public recordDegradedData(): void {
        this.snapshot.recentTriggers.degradedDataBursts++;
        this.evaluateControlState();
    }

    public recordToxicity(): void {
        this.snapshot.recentTriggers.toxicityBursts++;
        this.evaluateControlState();
    }

    public recordNormalExecution(): void {
        if (!this.snapshot.cooldownActive && !this.snapshot.manualKillSwitch) {
            // Decay or reset bursts on successful normal execution
            this.snapshot.recentTriggers.executionSkipBursts = 0;
            this.snapshot.recentTriggers.executionDelayBursts = 0;
            this.snapshot.recentTriggers.degradedDataBursts = 0;
            this.snapshot.recentTriggers.toxicityBursts = 0;
            this.evaluateControlState();
        }
    }

    public evaluateControlState(): 'NORMAL' | 'REDUCED' | 'BLOCKED' {
        let mode: 'NORMAL' | 'REDUCED' | 'BLOCKED' = 'NORMAL';
        let blockReason = null;
        let autoBlocked = false;
        let reducedRiskMode = false;
        const now = Date.now();

        // 1. Check Cooldown Expiry
        if (this.snapshot.cooldownActive && this.snapshot.cooldownUntil) {
            const until = new Date(this.snapshot.cooldownUntil).getTime();
            if (now >= until) {
                this.snapshot.cooldownActive = false;
                this.snapshot.cooldownUntil = null;
                // Reset bursts after cooldown
                this.snapshot.recentTriggers.executionSkipBursts = 0;
                this.snapshot.recentTriggers.executionDelayBursts = 0;
                this.snapshot.recentTriggers.degradedDataBursts = 0;
                this.snapshot.recentTriggers.toxicityBursts = 0;
            }
        }

        // 2. Evaluate Triggers
        if (this.snapshot.recentTriggers.executionSkipBursts >= this.snapshot.thresholds.maxSequentialSkips) {
            if (!this.snapshot.cooldownActive) {
                this.snapshot.cooldownActive = true;
                this.snapshot.cooldownUntil = new Date(now + this.snapshot.thresholds.cooldownMs).toISOString();
            }
            autoBlocked = true;
            blockReason = `Auto-cooldown: Skip burst threshold reached (${this.snapshot.recentTriggers.executionSkipBursts})`;
        } else if (
            this.snapshot.recentTriggers.degradedDataBursts >= this.snapshot.thresholds.maxDegradedDataEvents &&
            this.snapshot.recentTriggers.executionSkipBursts > 0
        ) {
             if (!this.snapshot.cooldownActive) {
                this.snapshot.cooldownActive = true;
                this.snapshot.cooldownUntil = new Date(now + this.snapshot.thresholds.cooldownMs).toISOString();
            }
            autoBlocked = true;
            blockReason = `Auto-cooldown: Degraded data + Execution skips`;
        } else if (this.snapshot.recentTriggers.executionDelayBursts >= this.snapshot.thresholds.maxSequentialDelays) {
            reducedRiskMode = true;
        } else if (this.snapshot.recentTriggers.degradedDataBursts >= this.snapshot.thresholds.maxDegradedDataEvents) {
            reducedRiskMode = true;
        }


        const riskLimits = riskLimitsService.getSnapshot();
        if (riskLimits.currentDailyPnL <= -riskLimits.global.maxDailyLoss) {
            autoBlocked = true;
            blockReason = 'Max daily loss exceeded';
        } else if (riskLimits.currentDailyPnL <= -riskLimits.global.maxDailyLoss * 0.8) {
            reducedRiskMode = true;
        } else if (riskLimits.currentOpenPositions >= riskLimits.global.maxOpenPositions) {
            reducedRiskMode = true;
        }
    
        if (this.snapshot.cooldownActive) {
            autoBlocked = true;
            blockReason = blockReason || 'Cooling down from recent bursts';
        }

        if (this.snapshot.manualKillSwitch) {
            autoBlocked = true;
            blockReason = 'Manual Kill Switch Active';
        }

        this.snapshot.autoBlocked = autoBlocked;
        this.snapshot.reducedRiskMode = reducedRiskMode && !autoBlocked;
        
        if (autoBlocked) {
            mode = 'BLOCKED';
        } else if (reducedRiskMode) {
            mode = 'REDUCED';
        }

        if (this.snapshot.lastMode !== mode) {
            logStructured('SYSTEM', 'WARN', 'control_mode_changed', `Control mode changed to ${mode}`, {
                previousMode: this.snapshot.lastMode,
                newMode: mode,
                reason: blockReason || (reducedRiskMode ? 'Repeated minor degradation' : 'Normal conditions resumed')
            });
        }

        this.snapshot.lastMode = mode;
        if (blockReason) {
            this.snapshot.lastBlockReason = blockReason;
        }

        return mode;
    }
}

export const tradingControlService = new TradingControlService();
