import { Mastra } from "@mastra/core";
import { huginn } from "./agents/huginn";
import { fundDepsWorkflow } from "./workflows/fund-deps";
import { LibSQLStore } from "@mastra/libsql";
import { PinoLogger } from "@mastra/loggers";
import { Observability } from "@mastra/observability";
export { memory } from "./memory";

export const mastra = new Mastra({
  agents: { huginn },
  workflows: { fundDepsWorkflow },

  storage: new LibSQLStore({
    id: "mastra-storage",
    // stores observability, scores, ... into persistent file storage
    url: "file:./mastra.db",
  }),
  logger: new PinoLogger({
    name: 'Mastra',
    level: 'info',
  }),
  
});
