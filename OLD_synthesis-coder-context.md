# Huginn — Coder Context

## What We're Building
An AI agent (Huginn) that analyzes a GitHub repo's dependency tree, resolves each dependency to an Ethereum address via ERC-8185, and creates a Curator Studio funding strategy on-chain.

## Tech Decisions
- **Framework:** Mastra with Hono (not Next.js — this is an agent/API, no frontend needed)
- **Chain:** Sepolia for all contracts (Entity Registry + Curator Studio)
- **Agent Identity:** ERC-8004 on Base Mainnet (registered via Synthesis hackathon API)

## Existing SDKs to Use

### Entity Registry SDK (`@workspace/sdk` from ethereum-canonical-registry repo)
- Source: https://github.com/carlbarrdahl/ethereum-canonical-registry
- Key imports:
  - `toId(namespace, canonicalString)` — pure, computes bytes32 identifier
  - `canonicalise(value)` — lowercase, trim, strip trailing slash
  - `parseIdentifier("npm:viem")` — splits into { namespace, canonicalString }
  - `parseUrl("github.com/org/repo")` — parses URLs into identifiers
  - `resolveDepositAddress(id, registryAddress, bytecode)` — pure, computes escrow address
  - `createRegistryMethods(wallet, publicClient, deployments)` — returns registry object with:
    - `ownerOf(id)` → Address | null
    - `predictAddress(id)` → Address
    - `resolveIdentifier(namespace, cs, token?)` → { id, depositAddress, owner, balance }
    - `claim(namespace, cs, proof)` — write tx
    - `deployEscrow(id)` — write tx
    - `isEscrowDeployed(id)` → boolean
  - `createEscrowMethods(wallet, publicClient, deployments)` — returns:
    - `withdraw(escrowAddress, token)` — write tx

### Curator Studio SDK (`@workspace/sdk` from curate.fund repo)
- Source: https://github.com/carlbarrdahl/curate.fund
- Key imports:
  - `CuratorSDK(walletClient, chainId?)` — main class
  - `sdk.strategy.create(config)` → { strategy: Address, config }
    - config: `{ owner, sourceStrategy, allocations: [{recipient, weight, label}], metadataURI, ensLabel }`
  - `sdk.strategy.distribute(strategyAddress, tokenAddress)` → { hash }
  - `sdk.strategy.getData(strategyAddress)` → { owner, sourceStrategy, allocations, totalWeight, metadataURI }
  - `sdk.strategy.rebalance(strategyAddress, allocations, metadataURI)` → { hash }
  - `sdk.strategy.balanceOf(strategyAddress, token)` → bigint
  - `sdk.warehouse.withdraw(owner, token)` → { hash }
  - `sdk.warehouse.balanceOf(owner, token)` → bigint

### Important: Both SDKs use viem
- WalletClient + PublicClient from viem
- Sepolia chain config
- Agent needs a funded wallet (private key in .env) for write transactions

## Mastra Tools to Implement

### 1. `analyze-deps`
- Input: `{ repoUrl: string, excludeDevDeps?: boolean, agentFeeBps?: number }`
- Logic:
  1. `GET /repos/{owner}/{repo}/git/trees/{branch}?recursive=1` — find all package.json
  2. Fetch each package.json, parse `dependencies` (skip `devDependencies` if excluded)
  3. Handle monorepo: detect workspaces from root package.json or pnpm-workspace.yaml
  4. Deduplicate deps across workspaces
  5. Weight = (number of workspace packages using dep) × 2
  6. Add agent fee allocation
  7. Return weighted list with identifiers (e.g., "npm:viem")

### 2. `resolve-entity`
- Input: `{ identifier: string, token?: string }`
- Logic:
  1. `parseIdentifier(identifier)` → namespace + canonicalString
  2. **If npm namespace:** resolve to GitHub repo via npm registry API
     - `GET https://registry.npmjs.org/{packageName}`
     - Extract `repository.url` → parse GitHub org/repo
     - Most npm packages (~90%) link to their GitHub repo
     - Fall back to npm identifier if no GitHub link found
  3. `toId(resolvedNamespace, canonicalise(resolvedCanonical))` → bytes32
  4. `registry.ownerOf(id)` → address or null
  5. If null: `registry.predictAddress(id)` → escrow address
  6. Return `{ address, status: "registered" | "escrow", id, resolvedAs: "github:org/repo" }`

**Note:** Entity Registry currently has verifiers for GitHub and DNS only. npm packages are resolved by mapping to their GitHub repository via the npm registry API, then using the existing GitHub verifier. A dedicated npm provenance verifier (via Sigstore attestations) is future work.

### 3. `create-strategy`
- Input: `{ allocations: [{recipient, weight, label}], metadataURI: string, ensLabel?: string }`
- Logic:
  1. Build StrategyConfig with agent wallet as owner
  2. `sdk.strategy.create(config)`
  3. Return `{ strategyAddress, txHash, ensName }`

### 4. `distribute`
- Input: `{ strategyAddress: string, token: string }`
- Logic: `sdk.strategy.distribute(strategyAddress, token)`

### 5. `check-balance`
- Input: `{ strategyAddress: string, token: string }`
- Logic: `sdk.strategy.balanceOf(strategyAddress, token)`

## Mastra Workflow: `fund-deps`
Chains the tools: analyze-deps → resolve-entity (parallel for all deps) → create-strategy
This is the main entry point when someone says "fund dependencies of X"

## MCP Server
Mastra exposes tools as MCP endpoints automatically. Other agents can call Huginn's tools.

## Environment Variables Needed
```
GITHUB_TOKEN=             # GitHub API access
AGENT_PRIVATE_KEY=        # Sepolia wallet for tx signing
SEPOLIA_RPC_URL=          # Sepolia RPC endpoint
ENTITY_REGISTRY_ADDRESS=  # Deployed ERC-8185 on Sepolia
CURATOR_FACTORY_ADDRESS=  # Deployed StrategyFactory on Sepolia
ANTHROPIC_API_KEY=        # For Mastra agent LLM
IPFS_API_KEY=             # Pinata or web3.storage for metadata
```

## Don't Build (Out of Scope)
- Frontend/UI — Huginn is an API/agent only
- Oracle/verifier infrastructure — use existing deployed verifiers
- Token contracts — use existing test tokens on Sepolia
- ERC-8004 registration — done via Synthesis API, not in codebase