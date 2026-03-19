import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { sdk } from "../../lib/curator";

export const distribute = createTool({
  id: "distribute",
  description: "Distribute token balance from a strategy to all recipients.",
  inputSchema: z.object({
    strategyAddress: z.string().describe("Strategy contract address"),
    token: z.string().describe("ERC-20 token address to distribute"),
  }),
  outputSchema: z.object({ txHash: z.string() }),
  execute: async ({ strategyAddress, token }) => {
    const { hash } = await sdk.strategy.distribute(
      strategyAddress as `0x${string}`,
      token as `0x${string}`,
    );
    return { txHash: hash };
  },
});
