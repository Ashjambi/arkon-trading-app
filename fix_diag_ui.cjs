const fs = require('fs');
let code = fs.readFileSync('src/components/DiagnosticsSettings.tsx', 'utf8');

const search = `        <div className="space-y-6">
          <div className="grid grid-cols-4 gap-4">`;
          
const replace = `        <div className="space-y-6">
          <div className="bg-amber-500/10 border border-amber-500/30 text-amber-200 p-4 rounded-xl text-sm">
            <strong className="text-amber-500 mb-2 block">لماذا قد تكون هناك حالات "موافق عليها" دون فتح صفقات فعلية في MT5؟</strong>
            <ul className="list-disc list-inside space-y-1">
              <li>الموافقة هنا تعني أن محرك التداول (AI Studio) راجع الصفقة وأرسلها بنجاح إلى <strong>طابور الجسر (Bridge Queue)</strong>.</li>
              <li>إذا لم يسحب مستشار MT5 (EA) الصفقة خلال 30 ثانية، سيتم إزالتها تلقائيًا من الطابور.</li>
              <li>إذا كنت تستخدم <strong>بيئة معاينة AI Studio</strong>، فإن منصة MT5 لا تستطيع الاتصال بالجسر بسبب قيود الأمان (Cookie Check). يجب تشغيل السكربت محلياً أو رفعه على خادم حقيقي (Production).</li>
            </ul>
          </div>
          <div className="grid grid-cols-4 gap-4">`;

if (code.includes(search)) {
    code = code.replace(search, replace);
    fs.writeFileSync('src/components/DiagnosticsSettings.tsx', code);
    console.log("Replaced UI successfully");
} else {
    console.log("Could not find search block");
}
