import { Memory } from "@mastra/memory";

export const memory = new Memory({
  options: {
    lastMessages: 20,
    workingMemory: { enabled: true },
  },
});
