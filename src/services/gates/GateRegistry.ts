import { AppConfig, MarketAnalysisState } from "../../types";

export interface Gate {
    id: string;
    label: string;
    desc: string;
    getValue: (state: MarketAnalysisState) => number;
    getThreshold: (config: AppConfig) => number;
    invert?: boolean;
}

export const gateRegistry: Gate[] = [
    { id: 'hurst', label: 'عتبة Hurst', desc: 'لقياس اتجاهية السوق (أقل من 0.5 يعني ارتداد)', getValue: (s) => s.hurst, getThreshold: (c) => c.hurst, invert: true },
    { id: 'fisher', label: 'عتبة Fisher', desc: 'لقياس تشبع السعر', getValue: (s) => Math.abs(s.fisher), getThreshold: (c) => c.fisher },
    { id: 'vwapZScore', label: 'عتبة VWAP Z-Score', desc: 'الانحراف المعياري عن متوسط السعر (أكثر يعني جاهز للارتداد)', getValue: (s) => Math.abs(s.vwapZScore), getThreshold: (c) => c.vwapZScore },
    { id: 'rSquared', label: 'عتبة R-Squared', desc: 'لقياس قوة الترند', getValue: (s) => s.rSquared, getThreshold: (c) => c.rSquared },
    { id: 'dvol', label: 'عتبة DVOL', desc: 'لقياس التقلب', getValue: (s) => s.dvol, getThreshold: (c) => c.dvol },
    { id: 'ofi', label: 'عتبة OFI', desc: 'تدفق أوامر المؤسسات', getValue: (s) => Math.abs(s.liquidityGap), getThreshold: (c) => c.ofi },
    { id: 'volRatio', label: 'عتبة Vol Ratio', desc: 'نسبة التقلب', getValue: (s) => s.volRatio, getThreshold: (c) => c.volRatio },
];
