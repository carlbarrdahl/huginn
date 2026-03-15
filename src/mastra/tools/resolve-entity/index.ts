import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { EntityRegistrySDK } from "@ethereum-entity-registry/sdk";
import { createClients } from "../../lib/clients";
import { resolveNpmToGithub } from "../../lib/npm";

// NOTE: EntityRegistrySDK is broken on Base Sepolia (84532) — it reads
// deployments2.EntityRegistry.address but that chain uses the key "CanonicalRegistry".
// Until the SDK is fixed, use the utility-function fallback for non-hardhat chains.
// See: resolve-entity/base-sepolia-fallback.ts (if/when needed)

export const resolveEntity = createTool({
  id: "resolve-entity",
  description:
    "Resolve an off-chain identifier (npm package, GitHub repo, domain) to an Ethereum address via the ERC-8185 Entity Registry. Returns the identity account address (always available via CREATE2, even before the owner has interacted with Ethereum).",
  inputSchema: z.object({
    identifier: z.string().describe(
      "Entity identifier — e.g. 'npmjs.com/package/viem', 'github.com/org/repo', 'github:org/repo'"
    ),
    token: z.string().optional().describe("ERC-20 token address to check balance at the identity account"),
  }),
  outputSchema: z.object({
    address: z.string().describe("Identity account address (use as recipient in strategy allocations)"),
    depositAddress: z.string(),
    owner: z.string().nullable(),
    status: z.enum(["claimed", "unclaimed"]),
    id: z.string(),
    resolvedAs: z.string(),
    balance: z.string().nullable(),
  }),
  execute: async ({ identifier, token }) => {
    // For npm packages, try to resolve to GitHub repo first (better entity match)
    let resolveAs = identifier;
    if (identifier.includes("npmjs.com/package/")) {
      const packageName = identifier.replace("npmjs.com/package/", "");
      const github = await resolveNpmToGithub(packageName);
      if (github) resolveAs = github;
    }

    const { walletClient } = createClients();
    const sdk = new EntityRegistrySDK(walletClient as any);

    const state = await sdk.registry.resolve(resolveAs, token as `0x${string}` | undefined);
    const owner = state.owner ?? null;

    return {
      address: state.depositAddress,
      depositAddress: state.depositAddress,
      owner,
      status: owner ? "claimed" : "unclaimed",
      id: state.id,
      resolvedAs: resolveAs,
      balance: state.balance != null ? state.balance.toString() : null,
    };
  },
});
