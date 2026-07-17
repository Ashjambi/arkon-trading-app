import React from 'react';
import { AppConfig } from '../types';

interface HedgeSettingsProps {
  config: AppConfig;
  setConfig: React.Dispatch<React.SetStateAction<AppConfig>>;
}

export const HedgeSettings: React.FC<HedgeSettingsProps> = ({ config, setConfig }) => {
  return (
    <div className="space-y-6">
      <h2 className="text-3xl font-black text-white italic tracking-tighter">الهيدج والانعكاس</h2>
      <div className="grid grid-cols-2 gap-6">
        <label className="flex items-center justify-between p-4 bg-zinc-900 rounded-xl text-white text-xs font-bold">
          الهيدج الآلي
          <input 
            type="checkbox" 
            checked={config.autoHedgeEnabled} 
            onChange={(e) => setConfig(prev => ({ ...prev, autoHedgeEnabled: e.target.checked }))}
          />
        </label>
        <label className="flex items-center justify-between p-4 bg-zinc-900 rounded-xl text-white text-xs font-bold">
          نظام الانعكاس
          <input 
            type="checkbox" 
            checked={config.flipEnabled} 
            onChange={(e) => setConfig(prev => ({ ...prev, flipEnabled: e.target.checked }))}
          />
        </label>
        <div className="p-4 bg-zinc-900 rounded-xl text-white text-xs font-bold">
          نسبة حجم الهيدج:
          <input 
            type="number" 
            step="0.1"
            value={config.hedgeRatio} 
            onChange={(e) => setConfig(prev => ({ ...prev, hedgeRatio: parseFloat(e.target.value) }))}
            className="w-full mt-2 bg-zinc-800 p-2 rounded"
          />
        </div>
        <div className="p-4 bg-zinc-900 rounded-xl text-white text-xs font-bold">
          حساسية الانعكاس:
          <input 
            type="number" 
            value={config.flipSensitivityScore} 
            onChange={(e) => setConfig(prev => ({ ...prev, flipSensitivityScore: parseInt(e.target.value) }))}
            className="w-full mt-2 bg-zinc-800 p-2 rounded"
          />
        </div>
      </div>
    </div>
  );
};
