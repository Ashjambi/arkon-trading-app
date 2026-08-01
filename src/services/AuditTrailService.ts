export interface AuditPosition {
    asset: string;
    openPositions?: number;
    currentExposure?: number;
    direction?: 'LONG' | 'SHORT' | 'FLAT';
}

export interface TradeDecision {
    timestamp: number;
    signal: 'BUY' | 'SELL' | 'HOLD';
    oldPosition?: AuditPosition;
    newPosition?: AuditPosition;
    action: 'FLIP' | 'HEDGE' | 'BOOST' | 'HOLD';
    reasoning: string;
    marketConditions: {
        volatility: number;
        trendStrength: number;
        volumeProfile: number;
    };
    riskMetrics: {
        maxDrawdown: number;
        exposureRatio: number;
    };
    metadata?: {
        actionType?: string;
        asset?: string;
        strategy?: string;
        decisionStage?: string;
        severity?: 'INFO' | 'WARN' | 'CRITICAL';
    };
}

interface AuditDatabase {
    insert(decision: TradeDecision): Promise<void>;
    getRecent(limit?: number): TradeDecision[];
}

class InMemoryAuditDatabase implements AuditDatabase {
    private records: TradeDecision[] = [];

    async insert(decision: TradeDecision): Promise<void> {
        this.records.push(JSON.parse(JSON.stringify(decision)));
        if (this.records.length > 5000) {
            this.records.shift();
        }
    }

    getRecent(limit: number = 200): TradeDecision[] {
        return this.records.slice(-Math.max(1, limit)).map((entry) => JSON.parse(JSON.stringify(entry)));
    }
}

class RemoteAuditFileLogger {
    async write(decision: TradeDecision, webhookUrl?: string, webhookSecret?: string): Promise<void> {
        if (!webhookUrl) return;

        const base = webhookUrl.replace(/\/$/, '');
        const endpoint = `${base}/api/diagnostics/audit-trail`;

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                // Route requires bridge auth; without this header every call previously 401'd.
                Authorization: `Bearer ${webhookSecret || ''}`,
            },
            body: JSON.stringify(decision),
        });

        if (!response.ok) {
            throw new Error(`Audit file write failed with status ${response.status}`);
        }
    }
}

class AuditAlertManager {
    private isCritical(decision: TradeDecision): boolean {
        if (decision.metadata?.severity === 'CRITICAL') return true;
        if (decision.riskMetrics.maxDrawdown >= 8) return true;
        if (decision.riskMetrics.exposureRatio >= 0.95) return true;
        if (decision.action === 'FLIP' || decision.action === 'HEDGE') return true;
        return false;
    }

    async notifyIfCritical(
        decision: TradeDecision,
        notifier?: (decision: TradeDecision) => Promise<void> | void
    ): Promise<void> {
        if (!notifier) return;
        if (!this.isCritical(decision)) return;
        await notifier(decision);
    }
}

export interface AuditLogOptions {
    webhookUrl?: string;
    webhookSecret?: string;
    criticalNotifier?: (decision: TradeDecision) => Promise<void> | void;
}

export class AuditLogger {
    constructor(
        private readonly db: AuditDatabase = new InMemoryAuditDatabase(),
        private readonly fileLogger: RemoteAuditFileLogger = new RemoteAuditFileLogger(),
        private readonly alertManager: AuditAlertManager = new AuditAlertManager()
    ) {}

    async logDecision(decision: TradeDecision, options: AuditLogOptions = {}): Promise<void> {
        await Promise.allSettled([
            this.db.insert(decision),
            this.fileLogger.write(decision, options.webhookUrl, options.webhookSecret),
            this.alertManager.notifyIfCritical(decision, options.criticalNotifier),
        ]);
    }

    getRecent(limit?: number): TradeDecision[] {
        return this.db.getRecent(limit);
    }
}

export const auditTrailService = new AuditLogger();
