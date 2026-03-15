import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { createIndexer } from "@curator-studio/sdk";

function getIndexer() {
  const url = process.env.CURATOR_INDEXER_URL;
  if (!url) throw new Error("CURATOR_INDEXER_URL is required");
  return createIndexer(url, process.env.CURATOR_TENANT);
}

const allocationSchema = z.object({
  recipient: z.string(),
  weight: z.string(),
  label: z.string().nullable().optional(),
});

const strategySchema = z.object({
  id: z.string(),
  owner: z.string(),
  metadata: z.object({
    title: z.string(),
    description: z.string().optional(),
  }).nullable(),
  allocations: z.array(allocationSchema),
  uniqueDonors: z.number(),
  timesForked: z.number(),
  createdAt: z.any(),
});

export const listStrategies = createTool({
  id: "list-strategies",
  description: "List funding strategies from the indexer, optionally filtered by owner address.",
  inputSchema: z.object({
    owner: z.string().optional().describe("Filter by owner address"),
    limit: z.number().default(10).describe("Max results (default 10)"),
  }),
  outputSchema: z.object({
    strategies: z.array(strategySchema),
    totalCount: z.number(),
  }),
  execute: async ({ owner, limit }) => {
    const indexer = getIndexer();
    const result = await indexer.strategy.query({
      where: owner ? { owner: owner.toLowerCase() } : undefined,
      limit,
      orderBy: "createdAt",
      orderDirection: "desc",
    });

    return {
      strategies: result?.items ?? [],
      totalCount: result?.totalCount ?? 0,
    };
  },
});

export const getStrategy = createTool({
  id: "get-strategy",
  description: "Get full details for a single strategy including allocations, metadata, and stats.",
  inputSchema: z.object({
    strategyAddress: z.string().describe("Strategy contract address"),
  }),
  outputSchema: z.object({
    strategy: strategySchema.nullable(),
  }),
  execute: async ({ strategyAddress }) => {
    const indexer = getIndexer();
    const strategy = await indexer.strategy.get(strategyAddress as `0x${string}`);
    return { strategy };
  },
});

export const strategyBalances = createTool({
  id: "strategy-balances",
  description: "Get token balances for a strategy — shows total received, distributed, and current balance per token.",
  inputSchema: z.object({
    strategyAddress: z.string().describe("Strategy contract address"),
  }),
  outputSchema: z.object({
    balances: z.array(z.object({
      token: z.string(),
      balance: z.string(),
      totalReceived: z.string(),
      totalDistributed: z.string(),
      totalReceivedUSD: z.string(),
      totalDistributedUSD: z.string(),
    })),
  }),
  execute: async ({ strategyAddress }) => {
    const indexer = getIndexer();
    const result = await indexer.strategyBalance.query({
      where: { strategyId: strategyAddress.toLowerCase() },
    });

    return { balances: result?.items ?? [] };
  },
});

export const listDistributions = createTool({
  id: "list-distributions",
  description: "List past distributions (payouts) for a strategy.",
  inputSchema: z.object({
    strategyAddress: z.string().describe("Strategy contract address"),
    limit: z.number().default(10).describe("Max results (default 10)"),
  }),
  outputSchema: z.object({
    distributions: z.array(z.object({
      id: z.string(),
      token: z.string(),
      totalAmount: z.string(),
      totalAmountUSD: z.string(),
      timestamp: z.any(),
      txHash: z.string(),
    })),
    totalCount: z.number(),
  }),
  execute: async ({ strategyAddress, limit }) => {
    const indexer = getIndexer();
    const result = await indexer.distribution.query({
      where: { strategyId: strategyAddress.toLowerCase() },
      limit,
      orderBy: "timestamp",
      orderDirection: "desc",
    });

    return {
      distributions: result?.items ?? [],
      totalCount: result?.totalCount ?? 0,
    };
  },
});
