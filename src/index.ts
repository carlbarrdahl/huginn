import { Hono } from "hono";
import { MastraServer } from "@mastra/hono";
import { mastra } from "./mastra/index";

const app = new Hono();
const server = new MastraServer({ app, mastra });
await server.init();

const port = Number(process.env.PORT || 4111);

export default {
  port,
  fetch: app.fetch,
};

console.log(`Huginn agent server running on http://localhost:${port}`);
