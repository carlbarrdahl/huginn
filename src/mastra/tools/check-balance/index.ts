import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { CuratorSDK } from "@curator-studio/sdk";
import { createClients } from "../../lib/clients";

export const checkBalance = createTool({
  id: "check-balance",
  description: "Check the token balance held by a strategy contract",
  inputSchema: z.object({
    strategyAddress: z.string().describe("Address of the strategy contract"),
    token: z.string().describe("ERC-20 token address"),
  }),
  outputSchema: z.object({
    balance: z.string().describe("Balance as string (bigint)"),
  }),
  execute: async ({ strategyAddress, token }) => {
    const { walletClient, chainId } = createClients();

    const sdk = new CuratorSDK(walletClient as any, { chain: chainId });

    const balance = await sdk.strategy.balanceOf(
      strategyAddress as `0x${string}`,
      token as `0x${string}`
    );

    return { balance: balance.toString() };
  },
});
