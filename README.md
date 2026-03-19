# Huginn

An AI funding agent that analyzes npm dependency trees, resolves each dependency to an Ethereum address via [ERC-8185](https://github.com/ethereum/ERCs/pull/1580), and creates on-chain funding strategies through [Curator Studio](https://curate-fund.vercel.app).

Built for The Synthesis hackathon.

## How it works

```
analyze-deps → resolve-entity → confirm → create-strategy → fund-strategy → distribute
```

1. **analyze-deps** — fetches the full dependency graph from [deps.dev](https://deps.dev), scores each package using a composite formula `(1/distance) × (1 + inDegree) × (1 + ln(1 + subtreeSize))`, and deduplicates monorepo siblings by resolving npm packages to their GitHub repos.
2. **resolve-entity** — resolves each GitHub/npm identifier to a deterministic Ethereum deposit address via the ERC-8185 Entity Registry. Works even for unclaimed projects.
3. **confirm-strategy** — presents the full allocation breakdown to the user for approval before any on-chain action.
4. **create-strategy** — deploys the strategy on-chain via Curator Studio with weighted allocations and metadata. Automatically picks an available ENS subdomain derived from the package name.
5. **fund-strategy** — transfers tokens (ERC-20 or native ETH) to the strategy address.
6. **distribute** — splits the strategy balance to all recipients via the SplitsWarehouse.

## Setup

```bash
cp .env.example .env.local
# fill in the values
npm install
```

### Environment variables

| Variable | Required | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | Yes | Claude API key |
| `AGENT_PRIVATE_KEY` | Yes | 0x-prefixed private key for signing transactions |
| `CHAIN_ID` | Yes | `31337` (Hardhat) or `84532` (Base Sepolia) |
| `HARDHAT_RPC_URL` | If chain=31337 | Defaults to `http://127.0.0.1:8545` |
| `BASE_SEPOLIA_RPC_URL` | If chain=84532 | Base Sepolia RPC endpoint |
| `CURATOR_TENANT` | Yes | Tenant ENS name (e.g. `huginn.eth`) |
| `CURATOR_UPLOAD_URL` | Yes | Metadata upload endpoint |
| `CURATOR_UPLOAD_SECRET` | Yes | Shared secret for the upload endpoint |
| `CURATOR_INDEXER_URL` | Yes | Indexer GraphQL endpoint |
| `GITHUB_TOKEN` | Recommended | Avoids GitHub API rate limits during npm→GitHub resolution |
| `TELEGRAM_BOT_TOKEN` | Optional | Enables the Telegram bot interface |

## Running

### Mastra dev playground

```bash
npm run dev
# open http://localhost:4111
```

### HTTP server (Hono)

```bash
npm run dev:server
# API available at http://localhost:4111
```

The server exposes the Mastra REST API and, if `TELEGRAM_BOT_TOKEN` is set, starts the Telegram bot automatically.

## Telegram bot

Set `TELEGRAM_BOT_TOKEN` and run the server. The bot:

- Maintains per-chat conversation memory (thread per `chatId`)
- Streams responses with live message edits
- Shows tool calls and results inline as they happen
- Asks for explicit approval before deploying any strategy on-chain

## Tools

| Tool | Description |
|---|---|
| `analyze-deps` | Dependency graph analysis with composite weighting |
| `resolve-entity` | npm/GitHub → Ethereum address via ERC-8185 |
| `confirm-strategy` | Human-in-the-loop approval gate |
| `create-strategy` | Deploy strategy on-chain with ENS subdomain |
| `fund-strategy` | Transfer ERC-20 or native ETH to a strategy |
| `distribute` | Split strategy balance to all recipients |
| `check-balance` | Check token balance held by a strategy |
| `check-own-balance` | Check the agent's own ETH or ERC-20 balance |
| `list-strategies` | Browse deployed strategies |
| `get-strategy` | Get full details for a strategy |
| `strategy-balances` | Token balances per strategy |
| `list-distributions` | Past distribution history |

## Supported chains

| Chain | ID |
|---|---|
| Hardhat (local) | 31337 |
| Base Sepolia | 84532 |

## Example prompt

> Fund the dependencies of `viem` with 0.1 ETH

Huginn will analyze viem's dependency tree, resolve ~30 top contributors to Ethereum addresses, present the allocation breakdown for your approval, deploy the strategy on-chain, and transfer the funds.

## Development

```bash
npm test          # run all tests
npm run test:watch  # watch mode
```
