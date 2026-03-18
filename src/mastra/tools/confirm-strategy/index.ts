import { createTool } from "@mastra/core/tools";
import { z } from "zod";

export const confirmStrategy = createTool({
  id: "confirm-strategy",
  description:
    "Present the resolved allocations to the user for review and approval before deploying the strategy on-chain. ALWAYS call this after resolve-entity and BEFORE create-strategy. Only call create-strategy if the user explicitly approves.",
  inputSchema: z.object({
    packageName: z.string(),
    allocations: z.array(
      z.object({
        name: z.string(),
        recipient: z.string(),
        depositAddress: z.string(),
        weight: z.number(),
        label: z.string(),
        status: z.enum(["claimed", "unclaimed"]),
      }),
    ),
  }),
  outputSchema: z.object({
    summary: z.string(),
  }),
  execute: async ({ packageName, allocations }) => {
    const rows = allocations
      .map(a => `- **${a.name}** (${a.status}): ${a.weight} bps → \`${a.recipient}\``)
      .join("\n");

    return {
      summary: `Ready to deploy strategy for **${packageName}**:\n\n${rows}\n\nDo you want to proceed?`,
    };
  },
});
