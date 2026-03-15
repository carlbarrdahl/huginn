# The Synthesis — Architecture Document

## System Overview

An AI agent (Huginn) that takes a GitHub repository, analyzes its dependency tree, resolves each dependency to an Ethereum address (or escrow), and creates a Curator Studio funding strategy on-chain.

```
Human: "Fund dependencies of carlbarrdahl/curate.fund"
  │
  ▼
┌──────────────────────────────────────────────────────────┐
│                    ODIN (AI Agent)                        │
│                                                          │
│  Step 1: Dependency Analysis                             │
│  ┌────────────────────────────────┐                      │
│  │ GitHub API                     │                      │
│  │ Fetch all package.json files   │                      │
│  │ across monorepo workspaces     │                      │
│  │ → deduplicated dep list        │                      │
│  │ → calculated weights           │                      │
│  └────────────┬───────────────────┘                      │
│               │                                          │
│  Step 2: Entity Resolution                               │
│  ┌────────────▼───────────────────┐                      │
│  │ Entity Registry SDK (ERC-8185) │                      │
│  │ For each dep:                  │                      │
│  │   toId("npm", "viem")          │                      │
│  │   → ownerOf(id)                │                      │
│  │   → if null: predictAddress(id)│                      │
│  │   → recipient address          │                      │
│  └────────────┬───────────────────┘                      │
│               │                                          │
│  Step 3: Strategy Creation                               │
│  ┌────────────▼───────────────────┐                      │
│  │ Curator Studio SDK             │                      │
│  │ strategy.create({              │                      │
│  │   owner: agentWallet,          │                      │
│  │   allocations: [...],          │                      │
│  │   metadataURI: "ipfs://...",   │                      │
│  │   ensLabel: "curate-fund-deps" │                      │
│  │ })                             │                      │
│  └────────────────────────────────┘                      │
│                                                          │
│  Identity: ERC-8004 on Base Mainnet                      │
└──────────────────────────────────────────────────────────┘
```

## Component 1: Dependency Analyzer

**Input:** GitHub repo URL (e.g., `carlbarrdahl/curate.fund`)
**Output:** Weighted allocation list

### API Calls

```typescript
// 1. Fetch repo tree to find all package.json files
GET https://api.github.com/repos/{owner}/{repo}/git/trees/{branch}?recursive=1
→ filter for files matching **/package.json

// 2. Fetch each package.json
GET https://api.github.com/repos/{owner}/{repo}/contents/{path}
→ parse JSON, extract dependencies (not devDependencies)

// 3. For monorepos: also parse workspace config
// root package.json → workspaces: ["apps/*", "packages/*"]
// or pnpm-workspace.yaml → packages: ["apps/*", "packages/*"]
```

### Weight Calculation

```typescript
type DependencyWeight = {
  name: string;           // e.g. "viem"
  identifier: string;     // e.g. "npm:viem"
  workspaceCount: number; // how many workspace packages use it
  isDirect: boolean;      // in dependencies (not devDependencies)
  weight: number;         // workspaceCount × (isDirect ? 2 : 1)
};

// Algorithm:
// 1. Collect all dependencies from all workspace package.json files
// 2. Deduplicate by package name
// 3. Count: how many workspace packages list this dep?
// 4. weight = workspaceCount × 2 (direct deps only, devDeps excluded)
// 5. Add agent curator fee as final allocation (e.g. 2%)
// 6. Normalize all weights

// Example for curate.fund:
// viem:     used in sdk, web, contracts (3) → weight 6
// wagmi:    used in web (1)                 → weight 2
// ponder:   used in indexer (1)             → weight 2
// next:     used in web, docs (2)           → weight 4
// ...
// agent fee: 2% of total
```

### MCP Server Interface

```typescript
// Tool: analyze-dependencies
// Input:
{
  repoUrl: string;        // "carlbarrdahl/curate.fund" or full URL
  excludeDevDeps: boolean; // default: true
  agentFeeBps: number;     // default: 200 (2%)
}

// Output:
{
  repo: string;
  totalDependencies: number;
  allocations: Array<{
    identifier: string;   // "npm:viem"
    name: string;         // "viem"  
    weight: number;       // normalized weight
    workspaceCount: number;
    reason: string;       // "Used in 3/5 workspace packages (sdk, web, contracts)"
  }>;
  agentFee: {
    recipient: string;    // agent wallet address
    weight: number;
    bps: number;
  };
}
```

## Component 2: Entity Resolution (ERC-8185 SDK)

**Input:** List of identifiers (e.g., `npm:viem`, `npm:wagmi`)
**Output:** List of Ethereum addresses (registered owner or escrow)

### SDK Calls

```typescript
import { toId, canonicalise, parseIdentifier } from "@workspace/sdk/utils";
import { createRegistryMethods } from "@workspace/sdk/registry";

const registry = createRegistryMethods(wallet, publicClient, deployments);

// For each dependency:
async function resolveRecipient(identifier: string, token?: Address) {
  const { namespace, canonicalString } = parseIdentifier(identifier);
  // e.g. namespace="npm", canonicalString="viem"

  // Step 0: If npm package, resolve to GitHub repo via npm registry
  let resolvedNamespace = namespace;
  let resolvedCanonical = canonicalString;
  if (namespace === "npm") {
    // Fetch npm registry: GET https://registry.npmjs.org/{package}
    // Extract repository.url → "github:org/repo"
    // Most npm packages link to their GitHub repo
    const npmMeta = await fetch(`https://registry.npmjs.org/${canonicalString}`);
    const data = await npmMeta.json();
    const repoUrl = data.repository?.url; // e.g. "git+https://github.com/wagmi-dev/viem.git"
    if (repoUrl?.includes("github.com")) {
      const match = repoUrl.match(/github\.com\/([^/]+\/[^/.]+)/);
      if (match) {
        resolvedNamespace = "github";
        resolvedCanonical = match[1].toLowerCase();
        // Optional: link npm:viem → github:wagmi-dev/viem via registry.linkIds()
      }
    }
  }

  // Step 1: Compute the bytes32 id (pure, no RPC)
  const id = toId(resolvedNamespace, canonicalise(resolvedCanonical));

  // Step 2: Check if entity is registered
  const owner = await registry.ownerOf(id);

  if (owner) {
    // Entity is registered → use their Ethereum address
    return { address: owner, status: "registered", resolvedAs: `${resolvedNamespace}:${resolvedCanonical}` };
  }

  // Step 3: Entity not registered → compute escrow address
  // This is deterministic — funds sent here can be claimed later
  const escrowAddress = await registry.predictAddress(id);

  return { address: escrowAddress, status: "escrow", resolvedAs: `${resolvedNamespace}:${resolvedCanonical}` };
}

// Full resolution with balance check:
async function resolveWithBalance(identifier: string, token: Address) {
  const { namespace, canonicalString } = parseIdentifier(identifier);
  const state = await registry.resolveIdentifier(namespace, canonicalString, token);
  // Returns: { id, depositAddress, owner, balance }
  return state;
}
```

### Available SDK Methods (Entity Registry)

| Method | Purpose | RPC? |
|---|---|---|
| `toId(namespace, canonicalString)` | Compute bytes32 identifier | No (pure) |
| `canonicalise(value)` | Normalize string (lowercase, trim) | No (pure) |
| `parseIdentifier("npm:viem")` | Split into namespace + canonicalString | No (pure) |
| `parseUrl("github.com/org/repo")` | Parse URL into namespace + canonicalString | No (pure) |
| `resolveDepositAddress(id, registry, bytecode)` | Compute escrow address | No (pure) |
| `registry.ownerOf(id)` | Get registered owner (null if unclaimed) | Yes |
| `registry.predictAddress(id)` | Get escrow address | Yes |
| `registry.resolveIdentifier(ns, cs, token?)` | Full state: owner + escrow + balance | Yes |
| `registry.claim(namespace, cs, proof)` | Claim ownership with oracle proof | Yes (write) |
| `registry.deployEscrow(id)` | Deploy escrow proxy (permissionless) | Yes (write) |
| `registry.isEscrowDeployed(id)` | Check if escrow proxy exists | Yes |
| `escrow.withdraw(escrowAddress, token)` | Withdraw from escrow to registered owner | Yes (write) |

## Component 3: Strategy Creation (Curator Studio SDK)

**Input:** Weighted allocations with resolved addresses
**Output:** On-chain strategy contract

### SDK Calls

```typescript
import { CuratorSDK, type Allocation, type StrategyConfig } from "@workspace/sdk";

const sdk = new CuratorSDK(walletClient);

// Build allocations from resolved dependencies
const allocations: Allocation[] = resolvedDeps.map(dep => ({
  recipient: dep.address as Address,    // registered owner or escrow
  weight: BigInt(dep.weight),
  label: `${dep.name} (${dep.status})`, // e.g. "viem (registered)" or "wagmi (escrow)"
}));

// Add agent curator fee
allocations.push({
  recipient: agentWalletAddress,
  weight: BigInt(agentFeeWeight),
  label: "Huginn Agent Fee",
});

// Create strategy on-chain
const { strategy } = await sdk.strategy.create({
  owner: agentWalletAddress,
  sourceStrategy: zeroAddress,      // no source (original strategy)
  allocations,
  metadataURI: metadataIpfsUrl,     // JSON with repo info, dep analysis, rationale
  ensLabel: "curate-fund-deps",     // → curate-fund-deps.support.eth
});

// Strategy is now live at `strategy` address
// Anyone can fund it by sending tokens to this address

// Later: distribute funds to recipients
await sdk.strategy.distribute(strategy, tokenAddress);

// Later: rebalance if dependency tree changes
await sdk.strategy.rebalance(strategy, newAllocations, newMetadataURI);
```

### Available SDK Methods (Curator Studio)

| Method | Purpose | RPC? |
|---|---|---|
| `strategy.create(config)` | Deploy new strategy with allocations + optional ENS | Yes (write) |
| `strategy.getData(address)` | Read strategy: owner, allocations, metadata | Yes |
| `strategy.balanceOf(address, token)` | Check token balance held by strategy | Yes |
| `strategy.distribute(address, token)` | Distribute balance to recipients via warehouse | Yes (write) |
| `strategy.rebalance(address, allocations, uri)` | Update allocations (owner only) | Yes (write) |
| `strategy.setENSName(address, label)` | Register ENS subdomain | Yes (write) |
| `warehouse.withdraw(owner, token)` | Recipient claims from warehouse | Yes (write) |
| `warehouse.balanceOf(owner, token)` | Check claimable balance | Yes |

## Component 4: Agent Identity (ERC-8004)

### Registration Call

```bash
curl -X POST https://synthesis.devfolio.co/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Huginn",
    "description": "Strategic life architect turned agent-native funding curator. Analyzes dependency trees and creates on-chain funding strategies via Curator Studio + ERC-8185 entity resolution.",
    "image": "https://...",
    "services": [
      {
        "name": "MCP",
        "endpoint": "https://.../mcp",
        "version": "1.0"
      },
      {
        "name": "analyze-dependencies",
        "endpoint": "https://.../api/analyze",
        "version": "1.0"
      }
    ],
    "humanInfo": { ... }
  }'
```

## End-to-End Flow

```
1. Human → Agent: "Fund dependencies of carlbarrdahl/curate.fund"

2. Agent → GitHub API:
   GET /repos/carlbarrdahl/curate.fund/git/trees/main?recursive=1
   GET /repos/carlbarrdahl/curate.fund/contents/package.json
   GET /repos/carlbarrdahl/curate.fund/contents/packages/sdk/package.json
   GET /repos/carlbarrdahl/curate.fund/contents/packages/contracts/package.json
   GET /repos/carlbarrdahl/curate.fund/contents/packages/indexer/package.json
   GET /repos/carlbarrdahl/curate.fund/contents/apps/web/package.json
   GET /repos/carlbarrdahl/curate.fund/contents/apps/docs/package.json
   → Deduplicated dependency list with weights

3. Agent → Entity Registry (for each dep):
   toId("npm", "viem") → 0xabc...
   registry.ownerOf(0xabc...) → 0x123... or null
   if null: registry.predictAddress(0xabc...) → 0xdef... (escrow)
   → Address list (mix of registered + escrow)

4. Agent → Curator Studio:
   sdk.strategy.create({
     owner: agentWallet,
     allocations: [
       { recipient: 0x123..., weight: 6n, label: "viem (registered)" },
       { recipient: 0xdef..., weight: 2n, label: "wagmi (escrow)" },
       { recipient: 0x456..., weight: 4n, label: "next (registered)" },
       ...
       { recipient: agentWallet, weight: 1n, label: "Huginn Agent Fee" },
     ],
     metadataURI: "ipfs://...",
     ensLabel: "curate-fund-deps"
   })
   → Strategy deployed at 0x789...

5. Human → Strategy:
   token.transfer(0x789..., amount)
   → Strategy funded

6. Anyone → Strategy:
   sdk.strategy.distribute(0x789..., tokenAddress)
   → Funds flow to warehouse

7. Recipients → Warehouse:
   sdk.warehouse.withdraw(recipientAddress, tokenAddress)
   → Funds claimed

8. Unregistered maintainers (later):
   registry.claim("npm", "wagmi", oracleProof)
   → Now owns escrow address
   escrow.withdraw(escrowAddress, tokenAddress)
   → Funds claimed retroactively
```

## Metadata Schema

Strategy metadata (stored at metadataURI, typically IPFS):

```json
{
  "title": "curate.fund Dependency Funding",
  "description": "Automated funding strategy for the dependency tree of carlbarrdahl/curate.fund, created by Huginn agent.",
  "repository": "carlbarrdahl/curate.fund",
  "agent": {
    "name": "Huginn",
    "erc8004Id": 42,
    "agentRegistry": "eip155:8453:0x..."
  },
  "analysis": {
    "timestamp": "2026-03-15T12:00:00Z",
    "totalDependencies": 23,
    "workspacePackages": ["sdk", "web", "contracts", "indexer", "docs"],
    "weightingMethod": "workspace-count-direct-2x",
    "excludedDevDeps": true
  },
  "allocations": [
    {
      "identifier": "npm:viem",
      "name": "viem",
      "weight": 6,
      "reason": "Used in 3/5 workspace packages (sdk, web, contracts)",
      "status": "registered",
      "resolvedAddress": "0x123..."
    }
  ]
}
```

## Agent Framework: Mastra

The agent is built with [Mastra](https://mastra.ai) — the same framework used for the AI receptionist. Mastra provides agent orchestration, tool definitions, and built-in MCP support.

### Project Structure

```
synthesis-agent/                    (Mastra project)
├── src/
│   ├── mastra/
│   │   ├── agents/
│   │   │   └── odin.ts             # Agent definition — orchestrates tools
│   │   ├── tools/
│   │   │   ├── analyze-deps.ts     # GitHub API → weighted dependency list
│   │   │   ├── resolve-entity.ts   # ERC-8185 entity resolution (ownerOf / predictAddress)
│   │   │   ├── create-strategy.ts  # Curator Studio SDK → deploy strategy on-chain
│   │   │   ├── distribute.ts       # Trigger distribution on existing strategy
│   │   │   └── check-balance.ts    # Check strategy/warehouse balances
│   │   ├── workflows/
│   │   │   └── fund-deps.ts        # Full pipeline: analyze → resolve → create
│   │   └── index.ts                # Mastra instance config
│   └── index.ts                    # Entry point
├── mastra.config.ts
├── package.json
└── .env                            # RPC URLs, GitHub token, agent private key
```

### Agent Definition

```typescript
// src/mastra/agents/odin.ts
import { Agent } from "@mastra/core";

export const odin = new Agent({
  name: "Huginn",
  instructions: `You are Huginn, an agent-native funding curator. 
    You analyze dependency trees and create on-chain funding strategies 
    via Curator Studio and ERC-8185 entity resolution.
    
    When asked to fund a repository's dependencies:
    1. Use analyze-deps to get the weighted dependency list
    2. Use resolve-entity for each dependency to get Ethereum addresses
    3. Use create-strategy to deploy the funding strategy on-chain
    4. Report the strategy address and ENS name to the user`,
  model: { provider: "ANTHROPIC", name: "claude-sonnet-4-20250514" },
  tools: {
    analyzeDeps,
    resolveEntity,
    createStrategy,
    distribute,
    checkBalance,
  },
});
```

### Tool Definitions

```typescript
// src/mastra/tools/analyze-deps.ts
import { createTool } from "@mastra/core";

export const analyzeDeps = createTool({
  id: "analyze-deps",
  description: "Analyze a GitHub repository's dependency tree and calculate weighted allocations",
  inputSchema: z.object({
    repoUrl: z.string().describe("GitHub repo (owner/repo or full URL)"),
    excludeDevDeps: z.boolean().default(true),
    agentFeeBps: z.number().default(200),
  }),
  execute: async ({ context }) => {
    // 1. Fetch repo tree via GitHub API
    // 2. Find all package.json files
    // 3. Parse dependencies across workspaces
    // 4. Deduplicate and calculate weights
    // 5. Return weighted allocation list
  },
});

// src/mastra/tools/resolve-entity.ts
export const resolveEntity = createTool({
  id: "resolve-entity",
  description: "Resolve an off-chain entity identifier to an Ethereum address via ERC-8185",
  inputSchema: z.object({
    identifier: z.string().describe("Entity identifier (e.g. npm:viem, github:org/repo)"),
    token: z.string().optional().describe("Token address to check balance"),
  }),
  execute: async ({ context }) => {
    // 1. parseIdentifier → namespace + canonicalString
    // 2. toId → bytes32
    // 3. registry.ownerOf → address or null
    // 4. if null: registry.predictAddress → escrow address
    // 5. Return { address, status: "registered" | "escrow" }
  },
});

// src/mastra/tools/create-strategy.ts
export const createStrategy = createTool({
  id: "create-strategy",
  description: "Create a Curator Studio funding strategy on-chain with weighted allocations",
  inputSchema: z.object({
    allocations: z.array(z.object({
      recipient: z.string(),
      weight: z.number(),
      label: z.string(),
    })),
    metadataURI: z.string(),
    ensLabel: z.string().optional(),
  }),
  execute: async ({ context }) => {
    // 1. Build StrategyConfig from allocations
    // 2. sdk.strategy.create(config)
    // 3. Return { strategyAddress, txHash, ensName }
  },
});
```

### Workflow (Full Pipeline)

```typescript
// src/mastra/workflows/fund-deps.ts
import { Workflow, Step } from "@mastra/core";

export const fundDepsWorkflow = new Workflow({
  name: "fund-dependencies",
  steps: [
    new Step({
      id: "analyze",
      execute: async ({ context }) => {
        // Call analyze-deps tool
        return { dependencies: [...] };
      },
    }),
    new Step({
      id: "resolve",
      execute: async ({ context }) => {
        // For each dependency: call resolve-entity
        // Parallel resolution for speed
        return { resolvedAllocations: [...] };
      },
    }),
    new Step({
      id: "create",
      execute: async ({ context }) => {
        // Upload metadata to IPFS
        // Call create-strategy with resolved allocations
        return { strategyAddress, ensName, txHash };
      },
    }),
  ],
});
```

### MCP Server

Mastra has built-in MCP support. The tools are automatically exposed as MCP endpoints:

```typescript
// Other agents can call:
// POST /mcp/tools/analyze-deps
// POST /mcp/tools/resolve-entity
// POST /mcp/tools/create-strategy
```

This means any MCP-compatible agent can use Huginn's tools to analyze dependencies and create funding strategies.

## Deployment Requirements

| Component | Network/Host | Notes |
|---|---|---|
| Entity Registry (ERC-8185) | Sepolia | Must be deployed with npm namespace verifier |
| Claimable Escrow (ERC-8186) | Sepolia | Part of Entity Registry deployment |
| Curator Studio contracts | Sepolia | Already deployed |
| Agent Identity (ERC-8004) | Base Mainnet | Registered via Synthesis API |
| Mastra Agent (Huginn) | Cloud (Vercel/Railway/VPS) | Hosts tools + MCP server |
| IPFS | Pinata / web3.storage | Strategy metadata uploads |

## Pre-hackathon Checklist

- [ ] Verify Entity Registry deployed on Sepolia with npm verifier
- [ ] Verify Curator Studio SDK works on Sepolia (create + distribute flow)
- [ ] Build dependency analyzer script (GitHub API → weighted deps)
- [ ] Test entity resolution end-to-end (toId → ownerOf → predictAddress)
- [ ] Prepare agent wallet on Sepolia with test ETH
- [ ] Prepare metadata schema + IPFS upload flow
- [ ] Draft MCP server interface
- [ ] Prepare ERC-8004 registration payload