/**
 * Sends a notification to a webhook (Discord/Slack compatible).
 * Notification failures never break the download
 */
export const notifyWebhook = async (
  webhookUrl: string | undefined,
  content: string,
) => {
  if (!webhookUrl) return;
  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, text: content }),
    });
    if (!res.ok) console.warn(`[webhook] Request failed: ${res.status}`);
  } catch (e: any) {
    console.warn(`[webhook] Cannot send a notification: ${e.message}`);
  }
};
