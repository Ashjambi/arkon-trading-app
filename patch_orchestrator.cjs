const fs = require('fs');

let code = fs.readFileSync('src/services/ExecutionOrchestrator.ts', 'utf8');

const target1 = `} else if (budgetCheck.approvedSize < executedLotSize) {
            this.addLog(\`⚠️ [STRATEGY BUDGET] تم تقليص حجم التنفيذ للاستراتيجية \${strategyName} من \${executedLotSize} إلى \${budgetCheck.approvedSize.toFixed(3)} بسبب الحد الأقصى للاستراتيجية.\`, 'RISK');
            executedLotSize = budgetCheck.approvedSize;
        }`;

const replacement1 = `} else if (budgetCheck.approvedSize < executedLotSize) {
            this.addLog(\`⚠️ [STRATEGY BUDGET] تم تقليص حجم التنفيذ للاستراتيجية \${strategyName} من \${executedLotSize} إلى \${budgetCheck.approvedSize.toFixed(3)} بسبب الحد الأقصى للاستراتيجية.\`, 'RISK');
            executedLotSize = budgetCheck.approvedSize;
            signalToSend.recommendedSize = executedLotSize;
        }`;

if (!code.includes('signalToSend.recommendedSize = executedLotSize;')) {
    code = code.replace(target1, replacement1);
}

fs.writeFileSync('src/services/ExecutionOrchestrator.ts', code);
console.log('Patched ExecutionOrchestrator.ts');
