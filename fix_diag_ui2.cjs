const fs = require('fs');
let code = fs.readFileSync('src/components/DiagnosticsSettings.tsx', 'utf8');

const search = `        <div className="space-y-6">
          <div className="bg-amber-500/10 border border-amber-500/30 text-amber-200 p-4 rounded-xl text-sm">
            <strong className="text-amber-500 mb-2 block">لماذا قد تكون هناك حالات "موافق عليها" دون فتح صفقات فعلية في MT5؟</strong>
            <ul className="list-disc list-inside space-y-1">
              <li>الموافقة هنا تعني أن محرك التداول (AI Studio) راجع الصفقة وأرسلها بنجاح إلى <strong>طابور الجسر (Bridge Queue)</strong>.</li>
              <li>إذا لم يسحب مستشار MT5 (EA) الصفقة خلال 30 ثانية، سيتم إزالتها تلقائيًا من الطابور.</li>
              <li>إذا كنت تستخدم <strong>بيئة معاينة AI Studio</strong>، فإن منصة MT5 لا تستطيع الاتصال بالجسر بسبب قيود الأمان (Cookie Check). يجب تشغيل السكربت محلياً أو رفعه على خادم حقيقي (Production).</li>
            </ul>
          </div>`;
          
const replace = `        <div className="space-y-6">
          <div className="bg-amber-500/10 border border-amber-500/30 text-amber-200 p-4 rounded-xl text-sm">
            <strong className="text-amber-500 mb-2 block">لماذا قد تكون هناك حالات "موافق عليها" دون فتح صفقات فعلية في MT5 (بيئة حقيقية/محلية)؟</strong>
            <ul className="list-disc list-inside space-y-1">
              <li><strong>انتهاء صلاحية الإشارة:</strong> يتم حذف الصفقة من طابور الجسر (Bridge Queue) تلقائياً إذا لم يقم الإكسبرت (EA) بسحبها خلال 30 ثانية. تأكد من أن الإكسبرت يعمل ويتصل بانتظام.</li>
              <li><strong>خطأ في الرموز (Symbols):</strong> قد يكون الوسيط (Broker) يستخدم لاحقة للرموز (مثل BTCUSD.pro أو BTCUSDm). النظام يرسل "BTCUSD". راجع سجل الخبراء (Experts tab) في MT5 للتأكد.</li>
              <li><strong>رفض من منصة MT5:</strong> قد يرفض الوسيط تنفيذ الصفقة بسبب (رصيد غير كافٍ، حجم اللوت أقل من المسموح به، أو السبريد مرتفع جداً وقت وصول الصفقة).</li>
              <li><strong>إعدادات MT5:</strong> تأكد من تفعيل زر "التداول الآلي" (Algo Trading) في منصة MT5، وأن الإكسبرت لديه صلاحية التداول.</li>
            </ul>
          </div>`;

if (code.includes(search)) {
    code = code.replace(search, replace);
    fs.writeFileSync('src/components/DiagnosticsSettings.tsx', code);
    console.log("Replaced UI successfully");
} else {
    console.log("Could not find search block");
}
