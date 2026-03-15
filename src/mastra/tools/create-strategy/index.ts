import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { createUploadFn, CuratorSDK } from "@curator-studio/sdk";
import { zeroAddress } from "viem";
import { createClients } from "../../lib/clients";

// Inline data URI — no IPFS needed for hardhat. Swap for Pinata when moving to mainnet.
const uploadMetadata = async (metadata: object): Promise<string> =>
  `data:application/json;base64,${Buffer.from(JSON.stringify(metadata)).toString("base64")}`;

// Monorepo packages (e.g. @lodestar/api, @lodestar/types) resolve to the
// same GitHub repo and thus the same on-chain identity account address.
// Aggregate their weights so the Splits config has one entry per recipient.
//
// Option A alternative: resolve npm→GitHub inside analyze-deps and aggregate
// there, so the output already reflects unique entities. Requires network
// calls during analysis but gives a more honest allocation list.
function aggregateByRecipient(
  allocations: { recipient: string; weight: number; label: string }[]
): { recipient: string; weight: number; label: string }[] {
  const byRecipient = new Map<string, { weight: number; labels: string[] }>();

  for (const a of allocations) {
    const existing = byRecipient.get(a.recipient);
    if (existing) {
      existing.weight += a.weight;
      existing.labels.push(a.label);
    } else {
      byRecipient.set(a.recipient, { weight: a.weight, labels: [a.label] });
    }
  }

  return Array.from(byRecipient.entries()).map(([recipient, { weight, labels }]) => ({
    recipient,
    weight,
    label: labels.length === 1 ? labels[0] : `${labels[0]} + ${labels.length - 1} more`,
  }));
}

export const createStrategy = createTool({
  id: "create-strategy",
  description:
    "Deploy a Curator Studio funding strategy on-chain with weighted allocations. Merges duplicate recipients (e.g. monorepo siblings that share an identity account).",
  inputSchema: z.object({
    allocations: z.array(
      z.object({
        recipient: z.string(),
        weight: z.number(),
        label: z.string(),
      }),
    ),
    title: z
      .string()
      .optional()
      .describe("Strategy title (e.g. 'viem Dependency Funding')"),
    description: z
      .string()
      .optional()
      .describe("Strategy description / analysis rationale — stored in on-chain metadata"),
  }),
  outputSchema: z.object({
    strategyAddress: z.string(),
  }),
  execute: async ({ allocations, title, description }) => {
    const { walletClient, account, chainId } = createClients();

    const sdk = new CuratorSDK(walletClient, {
      chain: chainId,
      tenant: process.env.CURATOR_TENANT,
      indexerUrl: process.env.CURATOR_INDEXER_URL!,
      uploadMetadata: createUploadFn(process.env.CURATOR_UPLOAD_URL!, process.env.CURATOR_UPLOAD_SECRET!),
    });

    const merged = aggregateByRecipient(allocations);

    const result = await sdk.strategy.create({
      owner: account.address,
      sourceStrategy: zeroAddress,
      allocations: merged.map((a) => ({
        recipient: a.recipient as `0x${string}`,
        weight: BigInt(a.weight),
        label: a.label,
      })),
      metadata: {
        title: title ?? "Huginn Dependency Funding Strategy",
        ...(description && { description }),
      },
      ensLabel: "",
    });

    return { strategyAddress: result.strategy };
  },
});
