import { Memory } from "@mastra/memory";
import { LibSQLStore } from "@mastra/libsql";

export const memory = new Memory({
  storage: new LibSQLStore({ id: "huginn", url: "file:./mastra.db" }),
  options: {
    lastMessages: 20,
    workingMemory: { enabled: true },
  },
});
