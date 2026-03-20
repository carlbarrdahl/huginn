import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { zeroAddress } from "viem";
import { agentAddress } from "../../lib/clients";
import { sdk } from "../../lib/curator";

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

function resolveStrategyTitle(title: string | undefined, packageName: string | undefined): string {
  const t = title?.trim();
  if (t) return t;
  const pkg = packageName?.trim();
  if (pkg) return `${pkg} Dependency Fund`;
  return "Huginn Dependency Fund";
}

export const createStrategy = createTool({
  id: "create-strategy",
  description:
    "Deploy a Curator Studio funding strategy on-chain with weighted allocations. Merges duplicate recipients. Pass packageName (same root package as analyze-deps / confirm-strategy) so metadata title matches the funded project when you omit title.",
  inputSchema: z.object({
    allocations: z.array(
      z.object({
        recipient: z.string(),
        weight: z.number(),
        label: z.string(),
      }),
    ),
    packageName: z
      .string()
      .optional()
      .describe("Root npm package being funded — used for on-chain strategy title when title is omitted"),
    title: z
      .string()
      .optional()
      .describe("Override strategy display title; defaults to \"{packageName} Dependency Fund\""),
    description: z.string().optional().describe("Analysis rationale — stored in on-chain metadata"),
  }),
  outputSchema: z.object({
    strategyAddress: z.string(),
    title: z.string(),
  }),
  execute: async ({ allocations, packageName, title, description }) => {
    const merged = aggregateByRecipient(allocations);
    const resolvedTitle = resolveStrategyTitle(title, packageName);

    const result = await sdk.strategy.create({
      owner: agentAddress,
      sourceStrategy: zeroAddress,
      allocations: merged.map((a) => ({
        recipient: a.recipient as `0x${string}`,
        weight: BigInt(a.weight),
        label: a.label,
      })),
      metadata: {
        title: resolvedTitle,
        ...(description && { description }),
      },
    });

    return {
      strategyAddress: result.strategy,
      title: resolvedTitle,
    };
  },
});
