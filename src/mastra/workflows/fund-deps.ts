import { createWorkflow, createStep } from "@mastra/core/workflows";
import { z } from "zod";
import { analyzeDeps } from "../tools/analyze-deps";
import { resolveEntity } from "../tools/resolve-entity";
import { createStrategy } from "../tools/create-strategy";

const AllocationSchema = z.object({
  identifier: z.string(),
  name: z.string(),
  weight: z.number(),
  distance: z.number(),
  reason: z.string(),
});

const ResolvedAllocationSchema = z.object({
  recipient: z.string(),
  depositAddress: z.string(),
  weight: z.number(),
  label: z.string(),
  status: z.enum(["claimed", "unclaimed"]),
  name: z.string(),
});

const analyzeStep = createStep({
  id: "analyze",
  inputSchema: z.object({
    packageName: z.string(),
    version: z.string().optional(),
    agentFeeBps: z.number().default(200),
  }),
  outputSchema: z.object({
    package: z.string(),
    version: z.string(),
    totalDependencies: z.number(),
    directCount: z.number(),
    indirectCount: z.number(),
    allocations: z.array(AllocationSchema),
    agentFee: z.object({
      recipient: z.string(),
      weight: z.number(),
      bps: z.number(),
    }),
  }),
  execute: async ({ inputData }) => analyzeDeps.execute(inputData),
});

const resolveStep = createStep({
  id: "resolve",
  inputSchema: z.object({
    allocations: z.array(AllocationSchema),
    agentFee: z.object({ recipient: z.string(), weight: z.number(), bps: z.number() }),
  }),
  outputSchema: z.object({
    resolvedAllocations: z.array(ResolvedAllocationSchema),
  }),
  execute: async ({ inputData }) => {
    const { allocations, agentFee } = inputData;

    const resolved = await Promise.all(
      allocations.map(async dep => {
        const result = await resolveEntity.execute({ identifier: dep.identifier });
        return {
          recipient: result.address,
          depositAddress: result.depositAddress,
          weight: dep.weight,
          label: `${dep.name} (${result.status})`,
          status: result.status,
          name: dep.name,
        };
      })
    );

    resolved.push({
      recipient: agentFee.recipient,
      depositAddress: agentFee.recipient,
      weight: agentFee.weight,
      label: `Huginn agent fee (${agentFee.bps} bps)`,
      status: "claimed" as const,
      name: "__agent_fee",
    });

    return { resolvedAllocations: resolved };
  },
});

const createStrategyStep = createStep({
  id: "create",
  inputSchema: z.object({
    resolvedAllocations: z.array(ResolvedAllocationSchema),
    packageName: z.string(),
  }),
  outputSchema: z.object({
    strategyAddress: z.string(),
  }),
  execute: async ({ inputData }) => {
    return createStrategy.execute({
      allocations: inputData.resolvedAllocations.map(a => ({
        recipient: a.recipient,
        weight: a.weight,
        label: a.label,
      })),
      title: `${inputData.packageName} Dependency Funding`,
    });
  },
});

export const fundDepsWorkflow = createWorkflow({
  id: "fund-dependencies",
  inputSchema: z.object({
    packageName: z.string(),
    version: z.string().optional(),
    agentFeeBps: z.number().default(200),
  }),
  outputSchema: z.object({
    strategyAddress: z.string(),
  }),
})
  .then(analyzeStep)
  .map(async ({ inputData, getInitData }) => {
    const init = getInitData<typeof fundDepsWorkflow>();
    return {
      allocations: inputData.allocations,
      agentFee: inputData.agentFee,
    };
  })
  .then(resolveStep)
  .map(async ({ inputData, getInitData }) => {
    const init = getInitData<typeof fundDepsWorkflow>();
    return {
      resolvedAllocations: inputData.resolvedAllocations,
      packageName: init.packageName,
    };
  })
  .then(createStrategyStep)
  .commit();
