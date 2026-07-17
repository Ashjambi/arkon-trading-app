const fs = require('fs');
let code = fs.readFileSync('UPDATES_LOG.md', 'utf8');

const newEntry = `* **دعم عملات جديدة (SOL & GOLD):**
  * تم إضافة دعم متكامل لتداول سولانا (SOL) والذهب (XAUUSD / PAXGUSDT) في التطبيق.
  * تم إضافة إعدادات مخصصة لمعايرة أحجام العقود (Lot Sizes) والـ Strategy Gates الخاصة بسولانا والذهب بشكل يتناسب مع طبيعة تذبذبهما.
  * تم دمج متابعة أسعار الذهب وسولانا في لوحة التحكم وتغذية الألغوريثم بالبيانات المباشرة للعمليتين.
`;

code = code.replace('* **معايرة مؤشرات البيتكوين (BTC Calibration):**', newEntry + '* **معايرة مؤشرات البيتكوين (BTC Calibration):**');
fs.writeFileSync('UPDATES_LOG.md', code);
console.log("Fixed log sol");
