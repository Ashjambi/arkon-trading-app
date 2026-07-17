import React from 'react';
import { AppConfig } from '../types';

interface RiskSettingsProps {
  config: AppConfig;
  setConfig: React.Dispatch<React.SetStateAction<AppConfig>>;
}

export const RiskManagementSettings: React.FC<RiskSettingsProps> = ({ config, setConfig }) => {
  return (
    <div className="space-y-6">
      <h2 className="text-3xl font-black text-white italic tracking-tighter">إدارة المخاطر</h2>
      <div className="grid grid-cols-2 gap-6">
        <div className="p-4 bg-zinc-900 rounded-xl text-white text-xs font-bold">
          حجم العقود الثابت (Lot Size):
          <input 
            type="number" 
            step="0.01"
            value={config.fixedLotSize} 
            onChange={(e) => setConfig(prev => ({ ...prev, fixedLotSize: parseFloat(e.target.value) }))}
            className="w-full mt-2 bg-zinc-800 p-2 rounded"
          />
        </div>
        <div className="p-4 bg-zinc-900 rounded-xl text-white text-xs font-bold">
          أقصى عدد للصفقات المفتوحة:
          <input 
            type="number" 
            step="1"
            value={config.maxOpenTrades} 
            onChange={(e) => setConfig(prev => ({ ...prev, maxOpenTrades: parseInt(e.target.value) || 1 }))}
            className="w-full mt-2 bg-zinc-800 p-2 rounded"
          />
        </div>
        <div className="p-4 bg-zinc-900 rounded-xl text-white text-xs font-bold">
          حد الخسارة اليومي (USD):
          <input 
            type="number" 
            value={config.dailyLossLimitUSD} 
            onChange={(e) => setConfig(prev => ({ ...prev, dailyLossLimitUSD: parseFloat(e.target.value) }))}
            className="w-full mt-2 bg-zinc-800 p-2 rounded"
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
            <div className="p-4 bg-zinc-900 rounded-xl text-white text-xs font-bold">
            حجم اللوت (BTC):
            <input 
                type="number" 
                step="0.01"
                value={config.fixedLotSizeBTC} 
                onChange={(e) => setConfig(prev => ({ ...prev, fixedLotSizeBTC: parseFloat(e.target.value) }))}
                className="w-full mt-2 bg-zinc-800 p-2 rounded"
            />
            </div>
            <div className="p-4 bg-zinc-900 rounded-xl text-white text-xs font-bold">
            حجم اللوت (ETH):
            <input 
                type="number" 
                step="0.1"
                min="0.1"
                value={config.fixedLotSizeETH} 
                onChange={(e) => setConfig(prev => ({ ...prev, fixedLotSizeETH: parseFloat(e.target.value) }))}
                className="w-full mt-2 bg-zinc-800 p-2 rounded"
            />
            </div>
        </div>
        <div className="p-4 bg-zinc-900 rounded-xl text-white text-xs font-bold">
          أقصى عدد صفقات للموجة (بالاتجاه الواحد):
          <input 
            type="number" 
            step="1"
            value={config.maxTradesPerWave} 
            onChange={(e) => setConfig(prev => ({ ...prev, maxTradesPerWave: parseInt(e.target.value) || 1 }))}
            className="w-full mt-2 bg-zinc-800 p-2 rounded"
          />
        </div>
        <div className="p-4 bg-zinc-900 rounded-xl text-white text-xs font-bold">
          مسافة التباعد الديناميكية للتعزيز (كسر من الحركة المتوقعة لـ DVOL):
          <br /><span className="text-[10px] text-zinc-500 font-normal">مثال: 0.25 تعني ربع الحركة اليومية المتوقعة للصانع</span>
          <input 
            type="number" 
            step="0.01"
            value={config.dynamicVolSpacing} 
            onChange={(e) => setConfig(prev => ({ ...prev, dynamicVolSpacing: parseFloat(e.target.value) || 0 }))}
            className="w-full mt-2 bg-zinc-800 p-2 rounded"
          />
        </div>
      </div>
    </div>
  );
};
