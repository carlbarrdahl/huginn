import TelegramBot from "node-telegram-bot-api";
import { huginn } from "./mastra/agents/huginn";

const MAX_MESSAGE_LENGTH = 4096;
const UPDATE_INTERVAL = 1000;

function htmlEscape(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function markdownToHtml(text: string): string {
  const codeBlocks: string[] = [];
  const withPlaceholders = text.replace(/```(?:\w+)?\n?([\s\S]*?)```/g, (_, code) => {
    codeBlocks.push(code);
    return `\x00CODE${codeBlocks.length - 1}\x00`;
  });

  const converted = htmlEscape(withPlaceholders)
    .replace(/^#{3}\s+(.+)$/gm, "<b>$1</b>")
    .replace(/^#{2}\s+(.+)$/gm, "<b>$1</b>")
    .replace(/^#{1}\s+(.+)$/gm, "<b>$1</b>")
    .replace(/^---+$/gm, "─────────────────────")
    .replace(/`([^`\n]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*\n]+)\*\*/g, "<b>$1</b>")
    .replace(/\*([^*\n]+)\*/g, "<i>$1</i>");

  return converted.replace(/\x00CODE(\d+)\x00/g, (_, i) => `<pre>${htmlEscape(codeBlocks[Number(i)])}</pre>`);
}


type Section = { type: "text"; content: string } | { type: "html"; content: string };

function renderSections(sections: Section[]): string {
  return sections
    .map(s => (s.type === "text" ? markdownToHtml(s.content) : s.content))
    .join("");
}

async function send(
  bot: TelegramBot,
  chatId: number,
  html: string,
  messageId?: number,
): Promise<number> {
  const content = html.slice(0, MAX_MESSAGE_LENGTH) || "(no response)";

  if (messageId) {
    try {
      await bot.editMessageText(content, { chat_id: chatId, message_id: messageId, parse_mode: "HTML" });
      return messageId;
    } catch { /* fall through */ }
  }

  try {
    const m = await bot.sendMessage(chatId, content, { parse_mode: "HTML" });
    return m.message_id;
  } catch { /* fall through */ }

  const m = await bot.sendMessage(chatId, content.replace(/<[^>]+>/g, ""));
  return m.message_id;
}

export class TelegramIntegration {
  private bot: TelegramBot;

  constructor(token: string) {
    this.bot = new TelegramBot(token, { polling: true });
    this.bot.on("message", this.handleMessage.bind(this));
    this.bot.on("polling_error", (err) => console.error("TG polling error:", err));
    console.log("Telegram bot started (polling)");
  }

  private async handleMessage(msg: TelegramBot.Message) {
    const chatId = msg.chat.id;
    const text = msg.text;
    const userId = msg.from?.id.toString() ?? `anon-${chatId}`;
    const firstName = msg.from?.first_name ?? "User";
    const username = msg.from?.username ?? "unknown";

    if (!text) {
      await this.bot.sendMessage(chatId, "Sorry, I can only process text messages.");
      return;
    }

    let currentMessageId: number | undefined;

    try {
      await this.bot.sendChatAction(chatId, "typing");

      const sections: Section[] = [];
      let lastUpdate = Date.now();

      const stream = await huginn.stream(text, {
        memory: {
          thread: `telegram-${chatId}`,
          resource: userId,
        },
        context: [{ role: "system", content: `Current user: ${firstName} (@${username})` }],
      });

      for await (const chunk of stream.fullStream) {
        switch (chunk.type) {
          case "text-delta": {
            const last = sections[sections.length - 1];
            if (last?.type === "text") {
              last.content += chunk.payload.text;
            } else {
              sections.push({ type: "text", content: chunk.payload.text });
            }
            break;
          }
          case "tool-call":
            sections.push({
              type: "html",
              content: `<i>🛠 ${htmlEscape(chunk.payload.toolName)}…</i>\n`,
            });
            break;
          case "error":
            sections.push({
              type: "html",
              content: `❌ ${htmlEscape(String(chunk.payload.error))}\n`,
            });
            break;
        }

        const rendered = renderSections(sections);
        if (!rendered) continue;

        const now = Date.now();
        if (now - lastUpdate >= UPDATE_INTERVAL) {
          currentMessageId = await send(this.bot, chatId, rendered, currentMessageId);
          lastUpdate = now;
        }
      }

      const finalHtml = renderSections(sections);
      if (finalHtml) await send(this.bot, chatId, finalHtml, currentMessageId);
    } catch (err) {
      console.error("Telegram handler error:", err);
      try {
        await this.bot.sendMessage(chatId, "Sorry, something went wrong. Please try again.");
      } catch { /* nothing we can do */ }
    }
  }
}
