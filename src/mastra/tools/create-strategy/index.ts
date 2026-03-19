import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { zeroAddress } from "viem";
import { agentAddress } from "../../lib/clients";
import { sdk } from "../../lib/curator";

async function resolveEnsLabel(title: string): Promise<string> {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);

  const candidates = [
    base,
    ...Array.from({ length: 5 }, (_, i) => `${base}-${i + 1}`),
  ];

  for (const label of candidates) {
    try {
      if (await sdk.ens.available(label)) return label;
    } catch {
      break;
    }
  }

  return `huginn-${Date.now()}`;
}

function aggregateByRecipient(
  allocations: { recipient: string; weight: number; label: string }[],
) {
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
    "Deploy a Curator Studio funding strategy on-chain with weighted allocations. Merges duplicate recipients.",
  inputSchema: z.object({
    allocations: z.array(
      z.object({
        recipient: z.string(),
        weight: z.number(),
        label: z.string(),
      }),
    ),
    title: z.string().optional().default("Huginn Dependency Fund"),
    description: z.string().optional().describe("Analysis rationale — stored in on-chain metadata"),
  }),
  outputSchema: z.object({
    strategyAddress: z.string(),
    title: z.string(),
  }),
  execute: async ({ allocations, title, description }) => {
    const merged = aggregateByRecipient(allocations);

    const result = await sdk.strategy.create({
      owner: agentAddress,
      sourceStrategy: zeroAddress,
      allocations: merged.map((a) => ({
        recipient: a.recipient as `0x${string}`,
        weight: BigInt(a.weight),
        label: a.label,
      })),
      metadata: {
        title,
        ...(description && { description }),
      },
      // ensLabel: await resolveEnsLabel(title),
    });

    return {
      strategyAddress: result.strategy,
      title,
    };
  },
});
