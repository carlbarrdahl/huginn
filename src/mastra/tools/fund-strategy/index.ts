import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { erc20Abi, parseUnits } from "viem";
import { createClients } from "../../lib/clients";

export const fundStrategy = createTool({
  id: "fund-strategy",
  description:
    "Fund a strategy by transferring ERC-20 tokens to its address. This is a simple token transfer — anyone can send tokens to a strategy.",
  inputSchema: z.object({
    strategyAddress: z.string().describe("Strategy contract address to fund"),
    token: z.string().describe("ERC-20 token address"),
    amount: z.string().describe("Amount in human-readable units (e.g. '100' for 100 USDC)"),
  }),
  outputSchema: z.object({
    txHash: z.string(),
    amount: z.string(),
    token: z.string(),
  }),
  execute: async ({ strategyAddress, token, amount }) => {
    const { walletClient, publicClient, account } = createClients();

    const decimals = await publicClient.readContract({
      address: token as `0x${string}`,
      abi: erc20Abi,
      functionName: "decimals",
    });

    const parsed = parseUnits(amount, decimals);

    const hash = await walletClient.writeContract({
      account,
      address: token as `0x${string}`,
      abi: erc20Abi,
      functionName: "transfer",
      args: [strategyAddress as `0x${string}`, parsed],
    });

    return { txHash: hash, amount, token };
  },
});
