import React from 'react';
import { AppConfig } from '../types';

interface EngineSettingsProps {
  config: AppConfig;
  setConfig: React.Dispatch<React.SetStateAction<AppConfig>>;
}

export const EngineSettings: React.FC<EngineSettingsProps> = ({ config, setConfig }) => {
  const setNumber = (key: keyof AppConfig, raw: string) => {
    const value = Number(raw);
    if (Number.isFinite(value)) {
      setConfig((prev) => ({ ...prev, [key]: value }));
    }
  };

  const setBoolean = (key: keyof AppConfig, value: boolean) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
  };

  const allowedRegimes = (config.hunterAllowedRegimes || []).join(', ');

  return (
    <div className="space-y-6">
      <h2 className="text-3xl font-black text-white italic tracking-tighter">محرك التنفيذ</h2>
      <div className="grid grid-cols-2 gap-6">
        <label className="flex items-center justify-between p-4 bg-zinc-900 rounded-xl text-white text-xs font-bold">
          التنفيذ التلقائي
          <input 
            type="checkbox" 
            checked={config.autoExecution} 
            onChange={(e) => setConfig(prev => ({ ...prev, autoExecution: e.target.checked }))}
          />
        </label>
        <label className="flex items-center justify-between p-4 bg-zinc-900 rounded-xl text-white text-xs font-bold">
          وضع Hunter القديم (خفض عتبات الاستراتيجيات)
          <input 
            type="checkbox" 
            checked={config.hunterMode} 
            onChange={(e) => setBoolean('hunterMode', e.target.checked)}
          />
        </label>
        <label className="flex items-center justify-between p-4 bg-zinc-900 rounded-xl text-white text-xs font-bold">
          Hunter Mode الذكي (تنفيذ انتقائي عالي القناعة)
          <input 
            type="checkbox" 
            checked={Boolean(config.hunterModeEnabled)}
            onChange={(e) => setBoolean('hunterModeEnabled', e.target.checked)}
          />
        </label>
        <div className="p-4 bg-zinc-900 rounded-xl text-white text-xs font-bold">
          الحد الأدنى لجودة الإشارة:
          <input 
            type="number" 
            value={config.minSignalScore} 
            onChange={(e) => setConfig(prev => ({ ...prev, minSignalScore: parseInt(e.target.value) }))}
            className="w-full mt-2 bg-zinc-800 p-2 rounded"
          />
        </div>
        <div className="p-4 bg-zinc-900 rounded-xl text-white text-xs font-bold">
          حد جودة Hunter
          <input
            type="number"
            value={config.hunterMinSignalScore ?? 88}
            onChange={(e) => setNumber('hunterMinSignalScore', e.target.value)}
            className="w-full mt-2 bg-zinc-800 p-2 rounded"
          />
        </div>
        <div className="p-4 bg-zinc-900 rounded-xl text-white text-xs font-bold">
          Hunter Size Multiplier
          <input
            type="number"
            step="0.05"
            value={config.hunterSizeMultiplier ?? 1.25}
            onChange={(e) => setNumber('hunterSizeMultiplier', e.target.value)}
            className="w-full mt-2 bg-zinc-800 p-2 rounded"
          />
        </div>
        <div className="p-4 bg-zinc-900 rounded-xl text-white text-xs font-bold">
          Hunter Target Multiplier
          <input
            type="number"
            step="0.05"
            value={config.hunterTargetMultiplier ?? 1.2}
            onChange={(e) => setNumber('hunterTargetMultiplier', e.target.value)}
            className="w-full mt-2 bg-zinc-800 p-2 rounded"
          />
        </div>
        <div className="p-4 bg-zinc-900 rounded-xl text-white text-xs font-bold">
          حد السبريد (bps)
          <input
            type="number"
            value={config.hunterMaxSpreadBps ?? 18}
            onChange={(e) => setNumber('hunterMaxSpreadBps', e.target.value)}
            className="w-full mt-2 bg-zinc-800 p-2 rounded"
          />
        </div>
        <div className="p-4 bg-zinc-900 rounded-xl text-white text-xs font-bold">
          الحد الاقصى لصفقات Hunter المتزامنة
          <input
            type="number"
            value={config.hunterMaxConcurrentHunterTrades ?? 3}
            onChange={(e) => setNumber('hunterMaxConcurrentHunterTrades', e.target.value)}
            className="w-full mt-2 bg-zinc-800 p-2 rounded"
          />
        </div>
        <div className="p-4 bg-zinc-900 rounded-xl text-white text-xs font-bold col-span-2">
          الانظمة السوقية المسموح بها (CSV)
          <input
            type="text"
            value={allowedRegimes}
            onChange={(e) => {
              const items = e.target.value.split(',').map((item) => item.trim()).filter(Boolean);
              setConfig((prev) => ({ ...prev, hunterAllowedRegimes: items }));
            }}
            className="w-full mt-2 bg-zinc-800 p-2 rounded"
          />
        </div>
        <label className="flex items-center justify-between p-4 bg-zinc-900 rounded-xl text-white text-xs font-bold">
          تعطيل Hunter اثناء السحب (Drawdown)
          <input
            type="checkbox"
            checked={Boolean(config.hunterDisableDuringDrawdown)}
            onChange={(e) => setBoolean('hunterDisableDuringDrawdown', e.target.checked)}
          />
        </label>
        <label className="flex items-center justify-between p-4 bg-zinc-900 rounded-xl text-white text-xs font-bold">
          السماح بإعادة الدخول (Reentry)
          <input
            type="checkbox"
            checked={Boolean(config.hunterAllowReentry)}
            onChange={(e) => setBoolean('hunterAllowReentry', e.target.checked)}
          />
        </label>
      </div>
    </div>
  );
};
