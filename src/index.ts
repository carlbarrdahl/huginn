import { Hono } from "hono";
import { MastraServer } from "@mastra/hono";
import { mastra } from "./mastra/index";
import { TelegramIntegration } from "./telegram";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const app = new Hono();
const server = new MastraServer({ app, mastra });
await server.init();

const port = Number(process.env.PORT || 4111);

export default {
  port,
  fetch: app.fetch,
};

console.log(`Huginn agent server running on http://localhost:${port}`);

if (process.env.TELEGRAM_BOT_TOKEN) {
  new TelegramIntegration(process.env.TELEGRAM_BOT_TOKEN);
} else {
  console.log("TELEGRAM_BOT_TOKEN not set — Telegram bot disabled");
}
