import React from 'react';
import { AppConfig } from '../types';

interface ChaseSettingsProps {
  config: AppConfig;
  setConfig: React.Dispatch<React.SetStateAction<AppConfig>>;
}

export const TrailingChaseSettings: React.FC<ChaseSettingsProps> = ({ config, setConfig }) => {
  return (
    <div className="space-y-6">
      <h2 className="text-3xl font-black text-white italic tracking-tighter">الإغلاق القسري للأرباح</h2>
      <div className="grid grid-cols-2 gap-6">
        <div className="p-4 bg-zinc-900 rounded-xl text-white text-xs font-bold col-span-2 shadow-2xl border border-zinc-800">
          مبلغ الإغلاق الإلزامي للصفقة بالدولار ($):
          <p className="text-zinc-500 font-normal text-[10px] mt-1 space-y-1">
             <span className="block text-amber-500">تم تفعيل الإغلاق الصارم:</span>
             <span className="block">بمجرد وصول ربح الصفقة لهذا الرقم، سيتم إرسال أمر إغلاق كلي فوري للميتاتريدر. لا يوجد تتبع أو إغلاق جزئي. يطبق على كافة الأزواج.</span>
          </p>
          <input 
            type="number" 
            step="0.01"
            min="0"
            value={config.forceClosePnL} 
            onChange={(e) => setConfig(prev => ({ ...prev, forceClosePnL: parseFloat(e.target.value) || 0 }))}
            className="w-full mt-4 bg-zinc-800/80 p-4 rounded-xl text-lg font-mono text-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all text-left"
            dir="ltr"
          />
        </div>
      </div>
    </div>
  );
};

