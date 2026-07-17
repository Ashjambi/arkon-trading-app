/**
 * Service to send alerts to Telegram.
 */
export const sendTelegramAlert = async (message: string) => {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    console.warn("Telegram alert service not configured. Skipping alert.");
    return;
  }

  try {
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        chat_id: chatId,
        text: `⚠️ Trading Engine Alert: ${message}`,
      }),
    });
  } catch (error) {
    console.error("Failed to send Telegram alert:", error);
  }
};
