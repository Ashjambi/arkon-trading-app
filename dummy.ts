export interface SanityDiagnosticReport {
    windowMs: number;
    totalOpportunities: number;
    approvedCount: number;
    rejectedCount: number;
    rejectionBreakdown: Record<string, number>;
    reasons: Array<{ stage: string; code: string; reason: string; timestamp: string; }>;
}
