import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { CuratorSDK } from "@curator-studio/sdk";
import { createClients } from "../../lib/clients";

export const distribute = createTool({
  id: "distribute",
  description: "Distribute token balance from a strategy to all recipients",
  inputSchema: z.object({
    strategyAddress: z.string().describe("Address of the strategy contract"),
    token: z.string().describe("ERC-20 token address to distribute"),
  }),
  outputSchema: z.object({
    txHash: z.string(),
  }),
  execute: async ({ strategyAddress, token }) => {
    const { walletClient, chainId } = createClients();

    const sdk = new CuratorSDK(walletClient as any, { chain: chainId });

    const { hash } = await sdk.strategy.distribute(
      strategyAddress as `0x${string}`,
      token as `0x${string}`
    );

    return { txHash: hash };
  },
});
