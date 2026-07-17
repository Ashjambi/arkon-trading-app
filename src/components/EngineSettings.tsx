import React from 'react';
import { AppConfig, StrategyType, StrategyPerformance, StrategyGates } from '../types';

interface EngineSettingsProps {
  config: AppConfig;
  setConfig: React.Dispatch<React.SetStateAction<AppConfig>>;
}

export const EngineSettings: React.FC<EngineSettingsProps> = ({ config, setConfig }) => {
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
          وضع الهنتر (إسكالبينج)
          <input 
            type="checkbox" 
            checked={config.hunterMode} 
            onChange={(e) => setConfig(prev => ({ ...prev, hunterMode: e.target.checked }))}
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
      </div>
    </div>
  );
};
