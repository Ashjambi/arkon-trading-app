import { getSignalLogs } from './signalLogger';
import { sendLabSuggestionToTelegram } from './telegramService';
import { AppConfig } from '../types';

export const runLabAnalysis = async (config: AppConfig) => {
    const logs = getSignalLogs();
    if (logs.length < 20) {
        return { success: false, message: "بيانات غير كافية للتحليل. نحتاج 20 صفقة على الأقل." };
    }

    // Basic Analysis: Group by strategy and outcome
    const stats: Record<string, { wins: number; losses: number; total: number }> = {};
    logs.forEach(log => {
        if (!stats[log.strategy]) {
            stats[log.strategy] = { wins: 0, losses: 0, total: 0 };
        }
        stats[log.strategy].total++;
        if (log.outcome === 'WIN') stats[log.strategy].wins++;
        if (log.outcome === 'LOSS') stats[log.strategy].losses++;
    });

    let suggestion = "<b>تقرير أداء البوابات:</b>\n\n";
    let needsImprovement = false;

    for (const [strategy, data] of Object.entries(stats)) {
        const winRate = data.total > 0 ? (data.wins / data.total) * 100 : 0;
        if (winRate < 45) {
            needsImprovement = true;
            suggestion += `<b>الاستراتيجية:</b> ${strategy}\n`;
            suggestion += `<b>معدل الفوز:</b> ${winRate.toFixed(1)}%\n`;
            suggestion += `<i>الاقتراح:</i> يرجى رفع عتبة بوابات الدخول لهذه الاستراتيجية لتقليل الإشارات الضعيفة.\n\n`;
        }
    }

    if (!needsImprovement) {
        return { success: true, message: "جميع الاستراتيجيات تعمل ضمن نطاق مقبول." };
    }

    // Send to Telegram
    const res = await sendLabSuggestionToTelegram(
        config.telegramBotToken,
        config.telegramChatId,
        suggestion
    );

    return { success: res.success, message: res.success ? "تم إرسال الاقتراحات لتليجرام." : "فشل إرسال الاقتراحات." };
};
