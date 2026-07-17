import { TradingSignal, SignalLog } from '../types';
import { logStructured } from '../utils/logger';

const STORAGE_KEY = 'arkon_signal_logs';

export const logSignal = async (signal: TradingSignal) => {
    const logEntry: SignalLog = {
        id: signal.id,
        timestamp: signal.timestamp,
        asset: signal.asset,
        strategy: signal.strategy,
        direction: signal.direction,
        entryPrice: signal.entry,
        regime: signal.details.quantRegime || 'UNKNOWN',
        qualityScore: signal.qualityScore,
        details: signal.details
    };

    try {
        // Get existing logs
        const existingLogs = localStorage.getItem(STORAGE_KEY);
        const logs: SignalLog[] = existingLogs ? JSON.parse(existingLogs) : [];
        
        // Add new log
        logs.push(logEntry);
        
        // Keep only last 1000 logs to prevent storage overflow
        if (logs.length > 1000) {
            logs.shift();
        }
        
        // Save back
        localStorage.setItem(STORAGE_KEY, JSON.stringify(logs));
        logStructured('SYSTEM', 'INFO', 'signal_logged', `Signal saved locally: ${logEntry.id}`, {
            id: logEntry.id,
            asset: logEntry.asset,
            strategy: logEntry.strategy
        });
    } catch (error) {
        logStructured('SYSTEM', 'ERROR', 'signal_logging_failed', `Failed to save signal: ${error instanceof Error ? error.message : String(error)}`, {
            id: logEntry.id,
            error: error instanceof Error ? error.stack : String(error)
        });
    }
};

export const getSignalLogs = (): SignalLog[] => {
    const logs = localStorage.getItem(STORAGE_KEY);
    return logs ? JSON.parse(logs) : [];
};
