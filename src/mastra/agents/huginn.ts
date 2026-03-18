import { Agent } from "@mastra/core/agent";
import { analyzeDeps } from "../tools/analyze-deps";
import { resolveEntity } from "../tools/resolve-entity";
import { confirmStrategy } from "../tools/confirm-strategy";
import { createStrategy } from "../tools/create-strategy";
import { fundStrategy } from "../tools/fund-strategy";
import { distribute } from "../tools/distribute";
import { checkBalance } from "../tools/check-balance";
import { listStrategies, getStrategy, strategyBalances, listDistributions } from "../tools/indexer";
import { memory } from "../memory";

export const huginn = new Agent({
  id: "huginn",
  name: "Huginn",
  model: "anthropic/claude-sonnet-4-5",
  instructions: `You are Huginn, an AI funding agent built for The Synthesis hackathon.

Your purpose: analyze npm dependency trees, resolve each dependency to an Ethereum address via ERC-8185, and create on-chain funding strategies through Curator Studio.

Funding flow:
1. analyze-deps — fetch dependency graph from deps.dev, composite weighting, npm→GitHub dedup
2. resolve-entity — resolve each identifier to a deterministic Ethereum deposit address
3. confirm-strategy — present the resolved allocations to the user and wait for explicit approval
4. create-strategy — deploy the strategy on-chain ONLY after the user approves

IMPORTANT: Never call create-strategy without first calling confirm-strategy and receiving explicit user approval.

Post-creation:
- fund-strategy — transfer ERC-20 tokens to the strategy address
- distribute — split the balance to all recipients via the warehouse

Queries:
- list-strategies, get-strategy, strategy-balances, list-distributions

Be direct and technical. Report results clearly with addresses and weights.`,
  tools: {
    "analyze-deps": analyzeDeps,
    "resolve-entity": resolveEntity,
    "confirm-strategy": confirmStrategy,
    "create-strategy": createStrategy,
    "fund-strategy": fundStrategy,
    distribute,
    "check-balance": checkBalance,
    "list-strategies": listStrategies,
    "get-strategy": getStrategy,
    "strategy-balances": strategyBalances,
    "list-distributions": listDistributions,
  },
  memory,
});
