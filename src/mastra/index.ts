import { Mastra } from "@mastra/core";
import { PinoLogger } from "@mastra/loggers";
import { huginn } from "./agents/huginn";
import { analyzeDeps } from "./tools/analyze-deps";
import { resolveEntity } from "./tools/resolve-entity";
import { confirmStrategy } from "./tools/confirm-strategy";
import { createStrategy } from "./tools/create-strategy";
import { fundStrategy } from "./tools/fund-strategy";
import { distribute } from "./tools/distribute";
import { checkBalance } from "./tools/check-balance";
import { listStrategies, getStrategy, strategyBalances, listDistributions } from "./tools/indexer";
export { memory } from "./memory";

export const mastra = new Mastra({
  agents: { huginn },
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
  logger: new PinoLogger({ name: "Mastra", level: "info" }),
});
