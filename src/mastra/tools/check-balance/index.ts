import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { CuratorSDK, type SupportedChainId } from "@curator-studio/sdk";
import { walletClient, chainId } from "../../lib/clients";

const sdk = new CuratorSDK(walletClient, {
  chain: chainId as SupportedChainId,
  indexerUrl: process.env.CURATOR_INDEXER_URL,
});

export const checkBalance = createTool({
  id: "check-balance",
  description: "Check the token balance held by a strategy contract.",
  inputSchema: z.object({
    strategyAddress: z.string().describe("Strategy contract address"),
    token: z.string().describe("ERC-20 token address"),
  }),
  outputSchema: z.object({ balance: z.string() }),
  execute: async ({ strategyAddress, token }) => {
    const balance = await sdk.strategy.balanceOf(
      strategyAddress as `0x${string}`,
      token as `0x${string}`,
    );
    return { balance: balance.toString() };
  },
});
