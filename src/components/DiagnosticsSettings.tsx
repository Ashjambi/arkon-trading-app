import React, { useEffect, useState } from 'react';
import { executionSanityDiagnosticService } from '../services/ExecutionSanityDiagnosticService';

export const DiagnosticsSettings: React.FC = () => {
  const [report, setReport] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [hours, setHours] = useState<string>("24");

  const fetchReport = async () => {
    setLoading(true);
    const parsedHours = parseInt(hours) || 24;
    try {
      const data = executionSanityDiagnosticService.generateDiagnosticReport(parsedHours * 60 * 60 * 1000);
      setReport(data);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  useEffect(() => {
    // Only fetch automatically if it's a valid number, or just debounce?
    // Actually, we can fetch if it's a valid number.
    const parsed = parseInt(hours);
    if (!isNaN(parsed) && parsed > 0) {
      fetchReport();
    }
  }, [hours]);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-3xl font-black text-white italic tracking-tighter">تشخيص نافذة التنفيذ</h2>
        <div className="flex items-center gap-3">
          <label className="text-xs text-zinc-400">النافذة الزمنية (ساعات):</label>
          <input
            type="number"
            value={hours}
            onChange={(e) => setHours(e.target.value)}
            className="bg-zinc-900 border border-zinc-800 text-white rounded p-2 text-sm w-20 text-center"
          />
          <button onClick={fetchReport} className="bg-zinc-800 hover:bg-zinc-700 text-white px-4 py-2 rounded text-xs">
            تحديث
          </button>
        </div>
      </div>

      {loading && <div className="text-zinc-500 text-sm">جاري التحميل...</div>}

      {!loading && report && (
        <div className="space-y-6">
          <div className="bg-amber-500/10 border border-amber-500/30 text-amber-200 p-4 rounded-xl text-sm">
            <strong className="text-amber-500 mb-2 block">لماذا قد تكون هناك حالات "موافق عليها" دون فتح صفقات فعلية في MT5 (بيئة حقيقية/محلية)؟</strong>
            <ul className="list-disc list-inside space-y-1">
              <li><strong>انتهاء صلاحية الإشارة:</strong> يتم حذف الصفقة من طابور الجسر (Bridge Queue) تلقائياً إذا لم يقم الإكسبرت (EA) بسحبها خلال 30 ثانية. تأكد من أن الإكسبرت يعمل ويتصل بانتظام.</li>
              <li><strong>خطأ في الرموز (Symbols):</strong> قد يكون الوسيط (Broker) يستخدم لاحقة للرموز (مثل BTCUSD.pro أو BTCUSDm). النظام يرسل "BTCUSD". راجع سجل الخبراء (Experts tab) في MT5 للتأكد.</li>
              <li><strong>رفض من منصة MT5:</strong> قد يرفض الوسيط تنفيذ الصفقة بسبب (رصيد غير كافٍ، حجم اللوت أقل من المسموح به، أو السبريد مرتفع جداً وقت وصول الصفقة).</li>
              <li><strong>إعدادات MT5:</strong> تأكد من تفعيل زر "التداول الآلي" (Algo Trading) في منصة MT5، وأن الإكسبرت لديه صلاحية التداول.</li>
            </ul>
          </div>
          <div className="grid grid-cols-4 gap-4">
            <div className="bg-zinc-900 p-4 rounded-xl border border-zinc-800 text-center">
              <div className="text-3xl font-black text-white">{report.totalOpportunities}</div>
              <div className="text-xs text-zinc-500 mt-1 uppercase">إجمالي الفرص</div>
            </div>
            <div className="bg-zinc-900 p-4 rounded-xl border border-zinc-800 text-center">
              <div className="text-3xl font-black text-emerald-500">{report.approvedCount}</div>
              <div className="text-xs text-zinc-500 mt-1 uppercase">الموافق عليها</div>
            </div>
            <div className="bg-zinc-900 p-4 rounded-xl border border-zinc-800 text-center">
              <div className="text-3xl font-black text-rose-500">{report.rejectedCount}</div>
              <div className="text-xs text-zinc-500 mt-1 uppercase">المرفوضة</div>
            </div>
            <div className="bg-zinc-900 p-4 rounded-xl border border-zinc-800 text-center flex flex-col justify-center">
                <div className="text-xs text-zinc-400">من {new Date(report.windowStartTime).toLocaleTimeString()}</div>
                <div className="text-xs text-zinc-400">إلى {new Date(report.windowEndTime).toLocaleTimeString()}</div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div className="bg-zinc-900/50 p-6 rounded-2xl border border-zinc-800">
                <h3 className="text-lg font-bold text-white mb-4">تصنيف الرفض حسب المرحلة</h3>
                {Object.entries(report.rejectionByStage || {}).length > 0 ? (
                    <div className="space-y-3">
                        {Object.entries(report.rejectionByStage).map(([stage, count]: any) => (
                            <div key={stage} className="flex justify-between items-center border-b border-zinc-800 pb-2">
                                <span className="text-sm font-bold text-zinc-300">{stage}</span>
                                <span className="text-rose-500 font-bold">{count}</span>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="text-zinc-500 text-sm">لا يوجد حالات رفض</div>
                )}
            </div>
            <div className="bg-zinc-900/50 p-6 rounded-2xl border border-zinc-800 overflow-hidden flex flex-col">
                <h3 className="text-lg font-bold text-white mb-4">أحدث حالات الرفض</h3>
                <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-3">
                    {report.recentRejections && report.recentRejections.length > 0 ? (
                        report.recentRejections.slice().reverse().map((rej: any, i: number) => (
                            <div key={i} className="bg-zinc-950 p-3 rounded-lg border border-zinc-800">
                                <div className="flex justify-between items-center mb-2">
                                    <span className="text-xs font-bold text-rose-400">{rej.stage}</span>
                                    <span className="text-[10px] text-zinc-600">{new Date(rej.timestamp).toLocaleTimeString()}</span>
                                </div>
                                <div className="text-xs text-zinc-300">
                                    <span className="text-amber-500 font-bold">[{rej.asset || 'SYS'}]</span> {rej.reason}
                                </div>
                                {rej.reasonCode && rej.reasonCode !== 'UNKNOWN' && (
                                    <div className="mt-2 text-[10px] text-zinc-500 font-mono bg-zinc-900 inline-block px-2 py-1 rounded">
                                        Code: {rej.reasonCode}
                                    </div>
                                )}
                            </div>
                        ))
                    ) : (
                        <div className="text-zinc-500 text-sm">لا يوجد سجلات</div>
                    )}
                </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
