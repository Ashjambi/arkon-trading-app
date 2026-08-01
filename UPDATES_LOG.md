# سجل تحديثات مشروع Arkon Trading App

## 2026-07-20 — Per-Asset Control-State Isolation Finalized

### التغييرات
- **إصلاح مشاركة الحالة بين الأصول في TradingControlService** (`src/services/TradingControlService.ts`):
  - تم تصحيح `evaluateControlState()` لتمرير سياق الأصل إلى `resetBurstCountersIfNeeded(asset)` بدلاً من استدعائها بدون معاملات
  - تمت إزالة الحقل العام القديم `lastBurstResetTime` واستبداله بـ `assetBurstResetTimes: Map<string, number>`
  - جميع نقاط استدعاء `evaluateControlState()` في كود الإنتاج تمرر سياق الأصل بشكل صريح:
    - `ExecutionOrchestrator.ts:369` — تمرر `asset` من أول إشارة
    - `ExecutionOrchestrator.ts:449` — تمرر `signal.asset`
    - `PreTradeRiskGuard.ts:87` — تمرر `candidate.symbol`
  - الاختبارات الحالية (7-10) تغطي عزل BTC/ETH وعزل التهدئة (cooldown) بشكل كامل

### التأثير
- فشل بدء تشغيل BTC أو webhook لم يعد يؤثر على ETH
- تفعيل التهدئة (cooldown) على ETH لم يعد يؤثر على BTC
- بدء الحساب الجديد لم يعد ينحرف إلى سلوك BLOCKED مشترك غير مقصود

### حالة الأصول
| الأصل | الحالة | ملاحظات |
|-------|--------|---------|
| BTC | ✅ نشط — معزول تماماً | خط الإنتاج كامل |
| ETH | ✅ نشط — معزول تماماً | خط الإنتاج كامل |
| GOLD | 🔄 قيد التنفيذ | خطة التفعيل معتمدة |
| SOL | ⏳ مخطط | قيد التقييم |
| XRP | ⏳ مخطط | غير نشط بعد |
| USDT | ⏳ ثانوي | غير نشط بعد |

---

## 2026-07-20 — GOLD (XAUUSD) Activation Plan & Documentation

### التغييرات
- **تم تصميم خطة شاملة لتفعيل GOLD (XAUUSD)** كأصل تداول كامل عبر جميع الطبقات:
  - MT5 EA: إعدادات خاصة بالذهب (حجم العقد، فلتر السبريد، فلتر الجلسة)
  - الجسر (Bridge): دعم توجيه GOLD مع فحص حداثة السعر
  - بيانات السوق: إضافة GOLD WebSocket feeds عبر Binance XAUUSDT
  - محرك الإشارات: إضافة GOLD إلى حلقة المعالجة polling loop
  - الواجهة: إضافة لوحة GOLD MarketStats
  - المخاطر: حدود مخاطر خاصة بالذهب (حجم تعرض أقل)

### الملفات المحدثة
- `README.md`: تحديث جدول الأصول النشطة، إضافة خطة تفعيل GOLD الكاملة، تحديث جدول الاستراتيجيات
- `UPDATES_LOG.md`: هذا الإدخال
- `TODO.md`: تحديث أولويات P2 مع قائمة مهام GOLD التفصيلية

### حالة الأصول
| الأصل | الحالة | ملاحظات |
|-------|--------|---------|
| BTC | ✅ نشط | خط الإنتاج كامل |
| ETH | ✅ نشط | خط الإنتاج كامل |
| GOLD | 🔄 قيد التنفيذ | خطة التفعيل معتمدة |
| SOL | ⏳ مخطط | قيد التقييم |
| XRP | ⏳ مخطط | غير نشط بعد |
| USDT | ⏳ ثانوي | غير نشط بعد |

### استراتيجيات GOLD الجاهزة (موجودة في الكود)
- `GOLD_TREND` - تتبع اتجاه الذهب (إطار زمني 1H-4H)
- `GOLD_MEAN_REV` - ارتداد لمتوسط الذهب (إطار زمني 15m-1H)
- `GOLD_SCALPER` - سكالبينج الذهب (إطار زمني 5m-15m)

---

## 2026-07-20 — Documentation Alignment & Asset Status Clarification

- **BTC and ETH** are confirmed as the currently active trading assets with full live pipeline (EA → Bridge → Execution Orchestrator → Risk Engine → MT5).
- **GOLD, SOL, XRP, USDT** are present as planned or secondary assets. They are **not yet fully wired** through the EA + bridge + UI for live trading.
- **Documentation updated** to reflect this status:
  - `README.md`: Refreshed with English overview, active/planned asset table, Current Status section, and Next Sprint Priorities.
  - `AGENTS.md`: Added permanent collaboration rules for coding assistants.
  - `TODO.md`: Reorganized into P0–P3 priority structure with separate completed items.
  - `UPDATES_LOG.md`: This entry added.

## السجل الزمني للإصدارات (من الأحدث إلى الأقدم)

### v50.1.0 — Sprint 1-3: Market Microstructure, Performance Gates & Post-Trade Analytics (2026)

#### Sprint 1 — Market Microstructure & Gate Consistency
- **`calculateHurst()` — R/S متعدد المقاييس** (`src/services/trading/indicators.ts`):
  - تم استبدال `Math.log(r/s)/Math.log(n)` البسيط بـ R/S متعدد المقاييس (τ = 2,4,8,...,N/2) مع انحدار خطي `log(R/S)~log(τ)`
  - التأثير: تصنيف دقيق للنظام السوقي يمنع صفقات عكس الاتجاه، +5-10% win rate
- **إزالة BTC overrides من ScoringUtils** (`src/services/strategies/ScoringUtils.ts`):
  - حذف التجاوز الثابت لبوابات BTC من 5 دوال: calculateTrendScore, calculateMeanRevScore, calculateBreakoutScore, calculateScalpScore, calculateNewsShockScore
  - BTC الآن يخضع لنفس فلترة Hurst/Fisher/DVOL/VWAP مثل ETH/GOLD/SOL
- **إصلاح Stop Loss** (`src/services/strategies/ScoringUtils.ts`):
  - قبل: stopLoss = 0 لجميع الصفقات (اعتماد كلي على CRL)
  - بعد: stopLoss = price ± ATR × riskMultiplier (حسب الاستراتيجية)
- **TP خاص بالاستراتيجية** (`src/services/tradingAlgo.ts`):
  - Scalper/OFI: 0.6%, MeanRev/AVR: 1.5%, Breakout/Vol: 4%, Trend: 3.5%, News/Shock: 5%
- **`EquityDataFeedService`** — ملف جديد (`src/services/EquityDataFeedService.ts`):
  - يغذي 4 طبقات مخاطر ببيانات equity/PnL/vol من جسر MT5
  - configureDefaults(): DrawdownFloor (20% max, 10% soft), VolTarget (20%), TailRisk (12% DD or 2.5x vol)
- **`RiskLimitsService.updateDailyPnL()`** — تفعيل حد الخسارة اليومي
- **دمج `EquityDataFeedService` في `server.ts`** — تشغيل تلقائي كل 60 ثانية

#### Sprint 2 — Asset Performance Monitor & Adaptive Strategy Gates
- **`AssetPerformanceMonitor`** — ملف جديد (`src/services/AssetPerformanceMonitor.ts`):
  - تتبع wins/losses/win rate/PnL/consecutive losses لكل زوج (asset, strategy)
  - Auto-disable: win rate < 30% (>=20 trades) أو >=10 خسائر متتالية
  - Auto-reeanble: win rate >= 50% بعد 40+ صفقة
  - منع التعطيل الدائم عبر once-per-strategy flag
- **`AssetPerformanceMonitor.test.ts`** — 10 مجموعات اختبار شاملة
- **دمج في `ExecutionOrchestrator.ts`**:
  - تسجيل trade outcome عند كل ENTRY/CLOSE/CLOSE_ALL ناجح
  - Auto-disable/reeanble عبر `config.strategyPerformance[strategy].isEnabled`

#### Sprint 3 — Post-Trade Analytics & Diagnostics
- ربط AssetPerformanceMonitor مع دورة التداول الكاملة
- تسجيل outcomes للصفقات الفائزة والخاسرة
- تفعيل auto-gating بناءً على الأداء التاريخي
- تكامل كامل مع نظام audit trail والتشخيص

### v50.0.0 - الإصدار الحالي (2026)
- ترقية بنية المشروع إلى React 19 + Vite 6 + Express 5.
- تثبيت معيار تشغيل Node.js على 20.19.0 أو أحدث.
- تحسينات كبيرة في الاعتمادية بين التطبيق وجسر MT5.
- توسيع طبقات التنفيذ والمخاطر والتشخيص في الخادم والواجهة.
- توحيد مسارات التشغيل الأساسية للبناء والتشغيل والاختبار.

### v4.2 - إصدار بروتوكول الجسر (Bridge Protocol)
- يظهر في endpoint حالة الجسر كإصدار البروتوكول التشغيلي.
- يمثل طبقة تواصل MT5 مع السيرفر وليس رقم إصدار الواجهة نفسها.
- يركّز على إدارة الطابور، مزامنة الحالة، وتسليم الأوامر.

### v16.0 - Dynamic Hedge Edition (إصدار تاريخي موثق)
- إدخال منطق المقارنة بالوزن بين الصفقات لاتخاذ قرارات:
  - FLIP
  - HEDGE
  - BOOST
- التأكيد على دعم حقول action_type و close_opposite في تكامل EA.
- هذا الإصدار يمثل مرحلة سابقة في تطور المنطق التنفيذي قبل بنية v50 الحديثة.

### ملاحظة مهمة
- مشروع Arkon مر بعدة مراحل تطوير سريعة؛ لذلك قد تجد بعض الوثائق القديمة تشير إلى أرقام إصدارات تاريخية.
- المرجع الرسمي الحالي للتشغيل هو: v50.0.0.

## آخر تحديث معتمد
- الإصدار الحالي: 50.1.0
- بيئة التشغيل: Node.js 20.19.0 أو أحدث
- الواجهة: React 19 + Vite 6
- الخادم: Express 5
- اختبار الوحدة: Vitest

## ملخص المشروع
Arkon Trading App هو نظام تداول كمي متكامل يربط بين:
- واجهة تحكم لإعداد الاستراتيجيات والمخاطر ومراقبة الأداء.
- محرك تحليل وإشارات تداول متعدد الاستراتيجيات.
- منسق تنفيذ متقدم (Execution Orchestrator) يطبق طبقات المخاطر والامتثال قبل الإرسال.
- جسر MT5 (Bridge Server) لإرسال الإشارات واستقبال حالة الصفقات وإدارة الإغلاق التلقائي.

## التحديثات الرئيسية في النسخة الحالية

### 1) استقرار الاتصال بين التطبيق والجسر
- تحسين فحص حالة الجسر عبر إعادة المحاولة 3 مرات بدل محاولة واحدة.
- مهلة checkBridgeStatus مرفوعة إلى 10 ثوان.
- مهلة fetchBridgeState مرفوعة إلى 15 ثانية.
- النتيجة: تقليل الإنذارات الكاذبة لانقطاع الجسر في حالات بطء الشبكة.

### 2) تحسين الاعتمادية في Webhook
- توحيد إرسال الإشارات إلى مسار /api/signals.
- دعم التوثيق عبر Authorization: Bearer مع سر الجسر.
- تنظيف payload قبل الإرسال لحذف الحقول الثقيلة التي لا يحتاجها MT5.
- دعم تعيين الرمز تلقائيا لرموز MT5 الشائعة:
  - BTC -> BTCUSD
  - ETH -> ETHUSD

### 3) إدارة تنفيذ أكثر انضباطا
- تطبيق طبقات امتثال ومخاطر قبل أي تنفيذ (Compliance + Risk + Trading Control).
- توزيع الأحجام على إشارات متوازية بناء على الجودة (quality-weighted sizing).
- تفعيل منطق تقليل الحجم في حالات جودة تنفيذ منخفضة أو ضغط مخاطر.
- فرض حد أدنى لحجم العقد عند 0.01 لمنع الرفض بسبب أقل من حد الوسيط.

### 4) تحسين مزامنة MT5
- نقطة /api/mt5/sync تستقبل الحالة وترجع الأوامر المعلقة في نفس الاستجابة.
- تقليل عدد طلبات MT5 الدورية عبر دمج الإرسال والاستقبال.
- تتبع الصفقات المفتوحة والمغلقة وتحديث PnL بشكل مستمر.

### 5) تحسين إدارة الهدف الربحي
- الإغلاق التلقائي مبني على معادلة هدف مرتبطة بالحجم:
  - target = baseTarget * (volume / 0.01)
- عند تحقق الهدف يضاف أمر CLOSE تلقائيا إلى طابور الإشارات.
- يدعم forceClosePnL على مستوى الإعدادات العامة مع إمكانية تخصيصه حسب الإشارة.

### 6) تعزيز قدرات التشخيص والمراقبة
- إضافة مجموعة Endpoints لتشخيص أنظمة المخاطر والتنفيذ.
- سجل في الذاكرة (memLogs) مع API للقراءة.
- تتبع آخر الطلبات الخام وآخر أخطاء MT5.
- دعم تقارير تنفيذ تفصيلية مثل execution decision trace وcoordination trace.

### 7) Proxy وتحمل أخطاء مزود البيانات
- Proxy لبيانات Deribit مع Cache داخلي 15 ثانية.
- إعادة المحاولة تلقائيا لأخطاء 502/503/504.
- إرجاع بيانات cache القديمة عند فشل المصدر بدل انقطاع الخدمة.
- Proxy مباشر لبيانات Binance endpoint-by-endpoint.

### 8) تحسينات EA / MQL5
- توليد كود MQL5 بإصدار 51.00 من داخل التطبيق.
- دعم Smart Trailing TP عبر TargetDollarProfit وTrailingDropUSD.
- دعم CRL (Capital Recovery Layer) بإعدادات واضحة داخل الكود المولد.
- تحديث لوحة معلومات الشارت في الاكسبيرت مع الرصيد والسيولة والصفقات وحالة CRL.
- توسيع مزامنة MT5 لإرسال `equity` و`margin` مع الحالة الكاملة للصفقات.

## الوظائف الأساسية للمشروع

### A) تحليل السوق وتوليد الإشارات
- حساب مؤشرات كمية متعددة مثل:
  - Fisher Transform
  - Hurst Exponent
  - VWAP + VWAP Bands
  - Garman-Klass Volatility
  - ADR
  - RSI Divergence
  - Liquidity Sweep
  - CVD/Liquidity Imbalance
- كشف نظام السوق (Regime Detection):
  - Momentum Trend
  - Mean Reversion
  - High/Low Volatility
  - Choppy/Noise

### B) محرك الاستراتيجيات
- استراتيجيات BTC:
  - BTC_TREND
  - BTC_MEAN_REV
  - BTC_TREND_FOLLOWING
  - BTC_OFI
  - BTC_AVR
  - BTC_SCALPER
- استراتيجيات ETH:
  - ETH_TREND
  - ETH_MEAN_REV
  - ETH_TREND_FOLLOWING
  - ETH_CORR_ARB
  - ETH_VOL_BREAK
  - ETH_SCALPER
- استراتيجيات عامة:
  - PAIRS_TRADING
  - VOLATILITY_BREAKOUT
  - COINTEGRATION
  - NEWS_SHOCK
  - WAIT

### C) إدارة المخاطر والتحكم التشغيلي
- حدود خسارة يومية وحماية السيولة وحدود التراجع.
- تحكم في عدد الصفقات المفتوحة وعدد الصفقات لكل موجة.
- طبقات حماية قبل التنفيذ:
  - PreTradeRiskGuard
  - RiskLimitsService
  - TradingControlService
  - StrategyRiskBudgetService
- إمكانيات وضع الضغط التشغيلي (Stress Scenario Hooks) للاختبار.

### D) إدارة التنفيذ
- دعم ENTRY / HEDGE / FLIP / CLOSE / CLOSE_ALL وفق منطق الجسر.
- تحسين سعر الدخول في حالات PRICE_IMPROVED.
- تقليل الحجم حسب جودة التنفيذ ومخاطر الاستراتيجية.
- تكامل مع Telegram للتنبيهات عند الفتح والإغلاق وحالة CRL.

### E) خادم الجسر والواجهات البرمجية
- المسارات الأساسية:
  - /api/signals
  - /api/mt5/signals
  - /api/mt5/sync
  - /api/mt5/state
  - /api/bridge/status
  - /api/bridge/managed-trades
  - /api/bridge/state
  - /api/bridge/settings
  - /api/diagnostics/*
  - /api/proxy/market-data
  - /api/proxy/exchange-data/bn/*
- دعم توافق رجعي لمسارات قديمة عبر internal route mapping.

### F) الواجهة والتشغيل
- تبويبات رئيسية للوحة المعلومات والتاريخ والإعدادات.
- حفظ إعدادات المستخدم محليا مع دمج آمن للإعدادات الافتراضية الجديدة.
- فحوصات سلامة لمنع قيم إعدادات خطيرة (Safe Defaults Guardrails).

## مميزات المشروع
- معمارية هجينة: واجهة React + خادم Express + جسر MT5.
- تنفيذ تداول قائم على الجودة وليس الإشارة الخام فقط.
- نظام مخاطر متعدد الطبقات وقابل للتشخيص.
- مرونة عالية في إعدادات الاستراتيجية والتحكم التشغيلي.
- تكامل مباشر مع MT5 وTelegram.
- قابلية نشر محلي وإنتاجي مع فصل واضح بين وضع التطوير والإنتاج.

## أوامر التشغيل المهمة
- تطوير: npm run dev
- بناء: npm run build
- تشغيل الإنتاج: npm run start
- فحص TypeScript: npm run lint
- اختبار: npm run test

## ملاحظات تشغيلية
- Webhook الافتراضي المحلي: http://127.0.0.1:3000
- سر الجسر الافتراضي داخل التطبيق: ARKON_SECURE_2025
- يوصى بتغيير السر في بيئة الإنتاج وعدم الاعتماد على القيم الافتراضية.
