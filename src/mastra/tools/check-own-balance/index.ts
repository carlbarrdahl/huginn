import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { publicClient, agentAddress } from "../../lib/clients";

const erc20Abi = [
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

export const checkOwnBalance = createTool({
  id: "check-own-balance",
  description:
    "Check the agent's own ETH balance, or its ERC-20 token balance if a token address is provided.",
  inputSchema: z.object({
    token: z
      .string()
      .optional()
      .describe("ERC-20 token address. Omit to check native ETH balance."),
  }),
  outputSchema: z.object({ balance: z.string(), address: z.string() }),
  execute: async ({ token }) => {
    if (token) {
      const balance = await publicClient.readContract({
        address: token as `0x${string}`,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [agentAddress],
      });
      return { balance: balance.toString(), address: agentAddress };
    }

    const balance = await publicClient.getBalance({ address: agentAddress });
    return { balance: balance.toString(), address: agentAddress };
  },
});
