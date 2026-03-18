import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { EntityRegistrySDK } from "@ethereum-entity-registry/sdk";
import { walletClient, chainId } from "../../lib/clients";
import { resolveNpmToGithub } from "../../lib/npm";
import type { SupportedChainId } from "@ethereum-entity-registry/sdk";

const sdk = new EntityRegistrySDK(walletClient, chainId as SupportedChainId);

export const resolveEntity = createTool({
  id: "resolve-entity",
  description:
    "Resolve an off-chain identifier (npm package, GitHub repo, domain) to an Ethereum address via the ERC-8185 Entity Registry.",
  inputSchema: z.object({
    identifier: z.string().describe("Entity identifier (e.g. 'github.com/org/repo', 'npmjs.com/package/viem')"),
    token: z.string().optional().describe("ERC-20 token address to check balance"),
  }),
  outputSchema: z.object({
    address: z.string(),
    depositAddress: z.string(),
    owner: z.string().nullable(),
    status: z.enum(["claimed", "unclaimed"]),
    id: z.string(),
    resolvedAs: z.string(),
    balance: z.string().nullable(),
  }),
  execute: async ({ identifier, token }) => {
    let resolveAs = identifier;
    if (identifier.includes("npmjs.com/package/")) {
      const pkg = identifier.replace("npmjs.com/package/", "");
      const github = await resolveNpmToGithub(pkg);
      if (github) resolveAs = github;
    }

    const state = await sdk.registry.resolve(resolveAs, token as `0x${string}` | undefined);
    const owner = (state as any).owner ?? null;
    const status: "claimed" | "unclaimed" = owner ? "claimed" : "unclaimed";

    return {
      address: state.depositAddress,
      depositAddress: state.depositAddress,
      owner,
      status,
      id: state.id,
      resolvedAs: resolveAs,
      balance: state.balance != null ? state.balance.toString() : null,
    };
  },
});
