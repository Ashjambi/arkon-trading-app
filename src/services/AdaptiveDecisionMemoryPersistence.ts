import { promises as fs } from 'fs';
import path from 'path';
import { MEMORY_VERSION, type AdaptiveDecisionMemorySnapshot } from './AdaptiveDecisionMemoryService';

export type AdaptiveDecisionMemoryPersistenceAdapter = {
    saveSnapshot(snapshot: AdaptiveDecisionMemorySnapshot): Promise<boolean> | boolean;
    loadSnapshot(): Promise<AdaptiveDecisionMemorySnapshot | null> | AdaptiveDecisionMemorySnapshot | null;
};

export type AdaptiveDecisionMemoryJsonFileAdapterOptions = {
    filePath: string;
};

function isValidSnapshot(payload: unknown): payload is AdaptiveDecisionMemorySnapshot {
    if (!payload || typeof payload !== 'object') return false;
    const snapshot = payload as Partial<AdaptiveDecisionMemorySnapshot>;
    if (typeof snapshot.version !== 'string') return false;
    if (snapshot.version !== MEMORY_VERSION) return false;
    if (typeof snapshot.createdAt !== 'number') return false;
    if (typeof snapshot.halfLifeHours !== 'number') return false;
    if (!Array.isArray(snapshot.entries)) return false;
    if (!snapshot.rejectionCounts || typeof snapshot.rejectionCounts !== 'object') return false;
    return true;
}

export class AdaptiveDecisionMemoryJsonFileAdapter implements AdaptiveDecisionMemoryPersistenceAdapter {
    private readonly filePath: string;

    constructor(options: AdaptiveDecisionMemoryJsonFileAdapterOptions) {
        this.filePath = options.filePath;
    }

    public async saveSnapshot(snapshot: AdaptiveDecisionMemorySnapshot): Promise<boolean> {
        if (!isValidSnapshot(snapshot)) {
            return false;
        }
        try {
            const dir = path.dirname(this.filePath);
            await fs.mkdir(dir, { recursive: true });
            await fs.writeFile(this.filePath, JSON.stringify(snapshot, null, 2), 'utf8');
            return true;
        } catch {
            return false;
        }
    }

    public async loadSnapshot(): Promise<AdaptiveDecisionMemorySnapshot | null> {
        try {
            const raw = await fs.readFile(this.filePath, 'utf8');
            if (!raw || !raw.trim()) return null;
            const parsed = JSON.parse(raw) as unknown;
            if (!isValidSnapshot(parsed)) {
                return null;
            }
            return parsed;
        } catch {
            return null;
        }
    }
}
