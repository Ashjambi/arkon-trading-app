export const sendTestMessage = async (
  token: string,
  chatId: string,
  webhookUrl: string,
) => {
  if (!token || !chatId) return { success: false };
  try {
    const response = await fetch(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          chat_id: chatId,
          text: `Test message from Arkon Quant Terminal. Webhook URL: ${webhookUrl}`,
        }),
      },
    );
    return { success: response.ok };
  } catch (error) {
    console.error("Error sending test message:", error);
    return { success: false };
  }
};

export const sendSignalToTelegram = async (
  signal: any,
  chatId: string,
  token: string,
  actionType: string,
  extraMessage: string,
  webhookUrl: string,
  crlState?: any
) => {
  if (!token || !chatId) return { success: false, error: "Missing token or chatId" };

  // Only send telegram alert for actual EXIT / closing actions
  if (actionType !== 'EXIT' && actionType !== 'CLOSE') {
     return { success: true };
  }
  
  // Helper to escape HTML special characters
  const escapeHtml = (text: string) => {
    if (typeof text !== 'string') return String(text);
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  };

  let crlSection = '';
  if (crlState) {
    const budgetLeft = typeof crlState.budget === 'number' ? crlState.budget : 0;
    const currentProfit = typeof crlState.current === 'number' ? crlState.current : 0;
    const diffProfit = typeof crlState.diff === 'number' ? crlState.diff : 0;
    const threshold = typeof crlState.threshold === 'number' ? crlState.threshold : 100;
    const untilTarget = Math.max(0, threshold - diffProfit);
    
    crlSection = `\n\n<b>📊 حالة نظام التعافي (CRL)</b>\n<b>💵 الميزانية المتاحة:</b> $${budgetLeft.toFixed(2)}\n<b>📈 صافي الربح الحالي:</b> $${currentProfit.toFixed(2)}\n<b>🎯 الهدف القادم:</b> $${threshold.toFixed(2)}\n<b>🔄 المتبقي للهدف:</b> $${untilTarget.toFixed(2)}`;
  }

  const actionAr = actionType === 'EXIT' ? 'إغلاق صفقة 🔴' : actionType;

  try {
    const message = `
<b>🚨 NEW SIGNAL: ${escapeHtml(signal.asset)} 🚨</b>
<b>Action:</b> ${escapeHtml(actionAr)}
<b>Direction:</b> ${escapeHtml(signal.direction)}
<b>Strength:</b> ${escapeHtml(signal.strength || 'N/A')}
<b>Entry:</b> ${escapeHtml(signal.entry || signal.entryPrice || 'N/A')}
<b>SL:</b> ${escapeHtml(signal.stopLoss || signal.sl || 'N/A')}
<b>TP:</b> ${escapeHtml(signal.takeProfit || signal.tp || 'N/A')}
<b>Score:</b> ${escapeHtml(signal.qualityScore || 'N/A')}
<b>Strategy:</b> ${escapeHtml(signal.strategy || 'N/A')}
<b>Reason:</b> ${escapeHtml(signal.reasoning || 'N/A')}
${escapeHtml(extraMessage)}${crlSection}
    `.trim();

    const response = await fetch(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          chat_id: chatId,
          text: message,
          parse_mode: "HTML",
        }),
      },
    );
    
    if (!response.ok) {
        const errorData = await response.json();
        console.error("Telegram API error:", errorData);
        return { success: false, error: JSON.stringify(errorData) };
    }
    
    return { success: true };
  } catch (error) {
    console.error("Error sending signal to telegram:", error);
    return { success: false, error: String(error) };
  }
};

export const sendTradeExecutionAlertToTelegram = async (
  token: string,
  chatId: string,
  asset: string,
  actionType: string,
  pnl: number | null,
  crlState?: any
) => {
  if (!token || !chatId) return { success: false, error: "Missing token or chatId" };

  if (actionType !== 'EXIT' && actionType !== 'CLOSE') {
     return { success: true };
  }
  
  let crlSection = '';
  if (crlState) {
    const budgetLeft = typeof crlState.budget === 'number' ? crlState.budget : 0;
    const currentProfit = typeof crlState.current === 'number' ? crlState.current : 0;
    const diffProfit = typeof crlState.diff === 'number' ? crlState.diff : 0;
    const threshold = typeof crlState.threshold === 'number' ? crlState.threshold : 100;
    const untilTarget = Math.max(0, threshold - diffProfit);
    
    crlSection = `\n\n<b>📊 حالة نظام التعافي (CRL)</b>\n<b>💵 الميزانية المتاحة:</b> $${budgetLeft.toFixed(2)}\n<b>📈 صافي الربح الحالي:</b> $${currentProfit.toFixed(2)}\n<b>🎯 الهدف القادم:</b> $${threshold.toFixed(2)}\n<b>🔄 المتبقي للهدف:</b> $${untilTarget.toFixed(2)}`;
  }

  const actionAr = actionType === 'EXIT' ? 'إغلاق صفقة 🔴' : actionType;

  try {
    const message = `<b>✅ TRADE EXECUTED: ${asset}</b>\n\n<b>Action:</b> ${actionAr}${pnl !== null ? `\n<b>PnL:</b> $${pnl.toFixed(2)}` : ''}${crlSection}`;
    
    const response = await fetch(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          chat_id: chatId,
          text: message,
          parse_mode: "HTML",
        }),
      },
    );
    
    return { success: response.ok };
  } catch (error) {
    console.error("Error sending trade execution alert to telegram:", error);
    return { success: false, error: String(error) };
  }
};

export const sendNoSignalsAlertToTelegram = async (
  token: string,
  chatId: string,
  message: string,
  crlState?: any
) => {
  if (!token || !chatId) return { success: false, error: "Missing token or chatId" };

  try {
    const response = await fetch(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          chat_id: chatId,
          text: `<b>⚠️ NO SIGNALS DETECTED</b>\n\n${message}`,
          parse_mode: "HTML",
        }),
      },
    );
    
    return { success: response.ok };
  } catch (error) {
    console.error("Error sending no signals alert to telegram:", error);
    return { success: false, error: String(error) };
  }
};

export const sendSystemAlertToTelegram = async (
  token: string,
  chatId: string,
  alertMessage: string,
  crlState?: any
) => {
  if (!token || !chatId) return { success: false, error: "Missing token or chatId" };

  try {
    const response = await fetch(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          chat_id: chatId,
          text: `<b>🚨 SYSTEM ALERT 🚨</b>\n\n${alertMessage}`,
          parse_mode: "HTML",
        }),
      },
    );
    
    return { success: response.ok };
  } catch (error) {
    console.error("Error sending system alert to telegram:", error);
    return { success: false, error: String(error) };
  }
};

export const sendLabSuggestionToTelegram = async (
  token: string,
  chatId: string,
  suggestion: string,
) => {
  if (!token || !chatId) return { success: false, error: "Missing token or chatId" };
  
  try {
    const message = `
<b>🧪 المختبر يقترح:</b>
<i>تحسين مقترح للبوابات</i>

${suggestion}
    `.trim();
    
    const response = await fetch(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          chat_id: chatId,
          text: message,
          parse_mode: "HTML",
        }),
      },
    );
    
    return { success: response.ok };
  } catch (error) {
    console.error("Error sending lab suggestion to telegram:", error);
    return { success: false, error: String(error) };
  }
};
