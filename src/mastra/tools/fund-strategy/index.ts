import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { erc20Abi, parseEther, parseUnits } from "viem";
import { walletClient, publicClient } from "../../lib/clients";

export const fundStrategy = createTool({
  id: "fund-strategy",
  description:
    "Fund a strategy by transferring tokens to its address. Omit token for native ETH transfer.",
  inputSchema: z.object({
    strategyAddress: z.string().describe("Strategy contract address to fund"),
    token: z.string().optional().describe("ERC-20 token address — omit for native ETH"),
    amount: z.string().describe("Amount in human-readable units (e.g. '0.1' for 0.1 ETH)"),
  }),
  outputSchema: z.object({
    txHash: z.string(),
    amount: z.string(),
    token: z.string(),
  }),
  execute: async ({ strategyAddress, token, amount }) => {
    if (!token) {
      const hash = await walletClient.sendTransaction({
        account: walletClient.account!,
        to: strategyAddress as `0x${string}`,
        value: parseEther(amount),
      });
      return { txHash: hash, amount, token: "ETH" };
    }

    const decimals = await publicClient.readContract({
      address: token as `0x${string}`,
      abi: erc20Abi,
      functionName: "decimals",
    });

    const hash = await walletClient.writeContract({
      account: walletClient.account!,
      address: token as `0x${string}`,
      abi: erc20Abi,
      functionName: "transfer",
      args: [strategyAddress as `0x${string}`, parseUnits(amount, decimals)],
    });

    return { txHash: hash, amount, token };
  },
});
