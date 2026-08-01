import React from 'react';
import { AppConfig } from '../types';
import { getMQL5Code } from '../utils/mqlCode';

interface Mql5SettingsProps {
  config: AppConfig;
  addLog: (msg: string, type: string) => void;
}

export const Mql5Settings: React.FC<Mql5SettingsProps> = ({ config, addLog }) => {
  return (
    <div className="space-y-12">
        <div className="flex flex-col gap-2">
            <h2 className="text-5xl font-black text-white italic tracking-tighter">كود MetaTrader 5 (MQL5)</h2>
            <p className="text-xs text-zinc-400">إعداد الميتاتريدر للربط مع السيرفر المحلي أو السحابي وتجنب مشاكل الاتصال.</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="p-8 bg-amber-500/10 border border-amber-500/20 rounded-3xl space-y-4">
                <div className="flex items-center gap-4">
                    <i className="fas fa-exclamation-triangle text-amber-500 text-3xl"></i>
                    <div>
                        <h3 className="text-sm font-black text-amber-500 uppercase tracking-wider">حل مشكلة حظر الاتصال (خطأ 4014)</h3>
                        <p className="text-[10px] text-amber-200/50">4014 ERR_FUNCTION_NOT_ALLOWED: WebRequest blocked</p>
                    </div>
                </div>
                <div className="space-y-3 text-xs text-amber-200/80 leading-relaxed font-semibold">
                    <p>الميتاتريدر 5 (MT5) يمنع أي طلب خارجي افتراضيًا. لحل المشكلة وتفعيل الربط المحلي أو السحابي:</p>
                    <ol className="list-decimal list-inside space-y-2 pl-2">
                        <li>افتح منصة ميتاتريدر 5 ثم اذهب إلى القائمة العلوية: <strong className="text-white">Tools ← Options</strong> (أو اضغط <strong className="text-white">Ctrl + O</strong>).</li>
                        <li>اختر تبويب <strong className="text-white">Expert Advisors</strong>.</li>
                        <li>ضع علامة صح بجانب خيار <strong className="text-white">Allow WebRequest for listed URL:</strong>.</li>
                        <li>أضف العناوين التالية بدقة (بدون رقم البورت في قائمة السماح):
                            <ul className="list-disc list-inside pl-4 mt-1 space-y-1 text-white font-mono">
                                <li>http://localhost</li>
                                <li>http://127.0.0.1</li>
                                {config.webhookUrl && !config.webhookUrl.includes('localhost') && !config.webhookUrl.includes('127.0.0.1') && (
                                    <li>{config.webhookUrl.endsWith('/') ? config.webhookUrl.slice(0, -1) : config.webhookUrl}</li>
                                )}
                            </ul>
                        </li>
                        <li className="text-[11px] text-amber-500/90 font-bold">⚠️ تنبيه هام: ميتاتريدر لا يقبل حفظ رقم البورت ":3000" في قائمة الـ Options، لذا أدرج http://localhost فقط، بينما في إعدادات الاكسبرت (Parameters) استخدم الرابط كاملًا بـ :3000</li>
                    </ol>
                </div>
            </div>

            <div className="p-8 bg-zinc-900/50 border border-zinc-800 rounded-3xl space-y-4">
                <div className="flex items-center gap-4">
                    <i className="fas fa-info-circle text-blue-400 text-3xl"></i>
                    <div>
                        <h3 className="text-sm font-black text-blue-400 uppercase tracking-wider">طريقة التثبيت والتشغيل</h3>
                        <p className="text-[10px] text-zinc-500">طريقة نسخ الأكواد وتشغيل الاكسبرت</p>
                    </div>
                </div>
                <div className="space-y-3 text-xs text-zinc-300 leading-relaxed">
                    <p>اتبع الخطوات التالية لبدء التداول التلقائي:</p>
                    <ol className="list-decimal list-inside space-y-2 pl-2 text-zinc-400">
                        <li>افتح <strong className="text-zinc-200">MetaEditor</strong> في ميتاتريدر 5 (اضغط <strong className="text-zinc-200">F4</strong>).</li>
                        <li>قم بإنشاء Expert Advisor جديد باسم <strong className="text-zinc-200">Arkon51EA</strong>.</li>
                        <li>احذف جميع الأسطر الافتراضية، ثم الصق الكود البرمجي المحدث بالكامل من الجهة اليمنى.</li>
                        <li>اضغط على زر <strong className="text-zinc-200">Compile</strong> في الأعلى؛ تأكد من عدم وجود أي أخطاء.</li>
                        <li>اسحب الاكسبرت للتشارت الخاص بـ <strong className="text-zinc-200">BTCUSD</strong> أو <strong className="text-zinc-200">ETHUSD</strong> بفريم <strong className="text-zinc-200">M15</strong> مع تفعيل <strong className="text-zinc-200">Algo Trading</strong>.</li>
                    </ol>
                </div>
            </div>
        </div>

        <div className="space-y-6">
            <div className="p-8 bg-amber-500/10 border border-amber-500/20 rounded-3xl flex items-center gap-6">
                <i className="fas fa-exclamation-triangle text-amber-500 text-2xl"></i>
                <p className="text-xs text-amber-200/80 leading-relaxed font-bold">تأكد من نسخ الكود المحدث ليتوافق مع بروتوكولات الربط والمزامنة والمخاطر (v51.00). الصقه في MetaEditor وقم بعمل Compile.</p>
            </div>
            <div className="relative group">
                <pre className="bg-black/60 p-10 rounded-3xl border border-zinc-800 font-mono text-[11px] text-zinc-400 overflow-x-auto max-h-[450px] custom-scrollbar text-left group-hover:border-zinc-700 transition-all" dir="ltr">
                    {getMQL5Code(config.webhookUrl, config.webhookSecret, config.maxOpenTrades)}
                </pre>
                <button 
                    onClick={() => {
                        navigator.clipboard.writeText(getMQL5Code(config.webhookUrl, config.webhookSecret, config.maxOpenTrades));
                        addLog("📋 تم نسخ الكود المحدث للحافظة", "SYSTEM");
                    }}
                    className="absolute top-8 right-8 px-8 py-4 bg-white text-black font-black rounded-2xl text-[10px] uppercase hover:bg-amber-500 transition-all shadow-2xl active:scale-90"
                >
                    <i className="fas fa-copy mr-2"></i> نسخ الكود بالكامل
                </button>
            </div>
        </div>
    </div>
  );
};
