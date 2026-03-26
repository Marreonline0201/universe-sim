// ── TelegramAgent.js ──────────────────────────────────────────────────────────
// Sends approval alerts to the owner's phone when an agent posts status=blocked.
// Uses inline keyboard buttons so the user can approve/reject from Telegram.
//
// Env vars required (set in Railway dashboard):
//   TELEGRAM_BOT_TOKEN  — from @BotFather
//   TELEGRAM_CHAT_ID    — your personal chat ID

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN
const CHAT_ID   = process.env.TELEGRAM_CHAT_ID

const BASE = () => `https://api.telegram.org/bot${BOT_TOKEN}`

async function post(method, body) {
  if (!BOT_TOKEN || !CHAT_ID) return
  try {
    const res = await fetch(`${BASE()}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    return res.json()
  } catch (e) {
    console.error(`[Telegram] ${method} failed:`, e.message)
  }
}

export async function sendBlockedAlert(agentId, task, message) {
  const lines = [
    `⚠️ *AGENT BLOCKED*`,
    ``,
    `*Agent:* \`${agentId}\``,
    task    ? `*Task:* ${task}`       : null,
    message ? `*Message:* ${message}` : null,
    ``,
    `Tap a button to respond:`,
  ].filter(l => l !== null).join('\n')

  return post('sendMessage', {
    chat_id: CHAT_ID,
    text: lines,
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [[
        { text: '✅ Approve', callback_data: `approve:${agentId}` },
        { text: '❌ Reject',  callback_data: `reject:${agentId}`  },
      ]],
    },
  })
}

export async function sendMessage(text) {
  return post('sendMessage', {
    chat_id: CHAT_ID,
    text,
    parse_mode: 'Markdown',
  })
}

export async function answerCallback(callbackQueryId, text) {
  return post('answerCallbackQuery', {
    callback_query_id: callbackQueryId,
    text,
    show_alert: false,
  })
}

export async function setWebhook(railwayUrl) {
  if (!BOT_TOKEN) {
    console.warn('[Telegram] TELEGRAM_BOT_TOKEN not set — skipping webhook registration')
    return
  }
  const result = await post('setWebhook', {
    url: `${railwayUrl}/telegram-webhook`,
    allowed_updates: ['callback_query', 'message'],
  })
  console.log('[Telegram] setWebhook result:', JSON.stringify(result))
}
