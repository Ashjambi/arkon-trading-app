const fs = require('fs');
let code = fs.readFileSync('UPDATES_LOG.md', 'utf8');

const newEntry = `* **معايرة مؤشرات البيتكوين (BTC Calibration):**
  * تم اكتشاف سبب ضعف أو عدم دخول صفقات للبيتكوين مقارنة بالإيثيريوم؛ وهو أن مؤشرات التذبذب (Volatility) مثل الـ DVOL والـ VWAP Z-Score كانت متطابقة للعملتين.
  * بطبيعة الحال، البيتكوين أقل تذبذباً (Lower Volatility) من الإيثيريوم، مما يجعله يفشل في تجاوز شروط الدخول القاسية.
  * تم تخفيض شروط الدخول للبيتكوين (مثل تقليل متطلب الـ DVOL من 50 إلى 40، وتقليل الـ VWAP Z-Score) ليتناسب مع طبيعة حركة البيتكوين الهادئة نسبياً، مما سيسمح بفتح صفقات للبيتكوين بشكل متوازن.
`;

code = code.replace('* **الإغلاق المُجمّع', newEntry + '* **الإغلاق المُجمّع');
fs.writeFileSync('UPDATES_LOG.md', code);
console.log("Fixed log btc");
