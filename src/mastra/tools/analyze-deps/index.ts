import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { calculateWeights, normalizeWeights, type RawDep, type WeightedDep } from "./weights";
import { batchResolveNpmToGithub } from "../../lib/npm";
import { agentAddress } from "../../lib/clients";

const DEPS_DEV_API = "https://deps.dev/_/s/npm/p";
const NPM_REGISTRY_API = "https://registry.npmjs.org";

async function fetchLatestVersion(packageName: string): Promise<string> {
  const res = await fetch(`${NPM_REGISTRY_API}/${encodeURIComponent(packageName)}/latest`);
  if (!res.ok) throw new Error(`npm registry error ${res.status}: ${packageName}`);
  const data = await res.json();
  return data.version as string;
}

type DepsDotDevDep = {
  package: { system: string; name: string };
  version: string;
  distance: number;
  dependencyCount: number;
  description?: string;
  licenses?: string[];
};

type GraphNode = {
  package: { system: string; name: string };
  version: string;
  nodeID: number;
};

type GraphEdge = { from: number; to: number };

type DepsDotDevGraphResponse = {
  package: { system: string; name: string };
  version: string;
  dependencyCount: number;
  directCount: number;
  indirectCount: number;
  dependencies: DepsDotDevDep[];
  dependencyGraph: { nodes: GraphNode[]; edges: GraphEdge[] };
};

async function fetchDependencyGraph(
  packageName: string,
  version: string
): Promise<DepsDotDevGraphResponse> {
  const url = `${DEPS_DEV_API}/${encodeURIComponent(packageName)}/v/${encodeURIComponent(version)}/dependenciesWithGraph`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`deps.dev error ${res.status}: ${packageName}@${version}`);
  return res.json();
}

function buildInDegreeMap(nodes: GraphNode[], edges: GraphEdge[]): Map<number, number> {
  const inDegree = new Map<number, number>();
  for (const node of nodes) inDegree.set(node.nodeID, 0);
  for (const edge of edges) inDegree.set(edge.to, (inDegree.get(edge.to) ?? 0) + 1);
  return inDegree;
}

// Aggregate weighted deps that share the same identifier (monorepo siblings).
// Sums raw weights; keeps the minimum distance and max inDegree for the reason string.
function aggregateByIdentifier(deps: WeightedDep[]): WeightedDep[] {
  const groups = new Map<string, { weight: number; names: string[]; minDistance: number; maxInDegree: number; maxSubtree: number }>();

  for (const d of deps) {
    const existing = groups.get(d.identifier);
    if (existing) {
      existing.weight += d.weight;
      existing.names.push(d.name);
      existing.minDistance = Math.min(existing.minDistance, d.distance);
      existing.maxInDegree = Math.max(existing.maxInDegree, d.inDegree);
      existing.maxSubtree = Math.max(existing.maxSubtree, d.subtreeSize);
    } else {
      groups.set(d.identifier, {
        weight: d.weight,
        names: [d.name],
        minDistance: d.distance,
        maxInDegree: d.inDegree,
        maxSubtree: d.subtreeSize,
      });
    }
  }

  return Array.from(groups.entries()).map(([identifier, g]) => ({
    name: g.names.length === 1 ? g.names[0] : `${g.names[0]} + ${g.names.length - 1} more`,
    distance: g.minDistance,
    inDegree: g.maxInDegree,
    subtreeSize: g.maxSubtree,
    weight: g.weight,
    identifier,
  }));
}

export const analyzeDeps = createTool({
  id: "analyze-deps",
  description:
    "Analyze an npm package's dependency tree via deps.dev, resolve npm→GitHub to dedup monorepo siblings, and return weighted allocations capped to maxAllocations. Uses composite formula: distance decay × graph in-degree × subtree size. After calling this tool, write a concise markdown description summarizing the results and pass it to create-strategy.",
  inputSchema: z.object({
    packageName: z.string().describe("npm package name (e.g. 'viem')"),
    version: z.string().optional().describe("Package version — defaults to latest"),
    agentFeeBps: z.number().default(200).describe("Agent fee in basis points (default: 200 = 2%)"),
    rootShareBps: z.number().default(0).describe("Fixed share for the root package in bps (default: 0). Set to e.g. 5000 to give 50% to the root."),
    maxAllocations: z.number().default(30).describe("Max allocations returned — remainder pooled into 'other dependencies' (default: 30)"),
  }),
  outputSchema: z.object({
    package: z.string(),
    version: z.string(),
    totalDependencies: z.number(),
    uniqueEntities: z.number(),
    directCount: z.number(),
    indirectCount: z.number(),
    allocations: z.array(
      z.object({
        identifier: z.string(),
        name: z.string(),
        weight: z.number(),
        distance: z.number(),
        reason: z.string(),
      })
    ),
    agentFee: z.object({
      recipient: z.string(),
      weight: z.number(),
      bps: z.number(),
    }),
  }),
  execute: async ({ packageName, version, agentFeeBps, rootShareBps, maxAllocations }) => {
    const resolvedVersion = version ?? (await fetchLatestVersion(packageName));
    const graph = await fetchDependencyGraph(packageName, resolvedVersion);

    const { nodes, edges } = graph.dependencyGraph;
    const inDegreeMap = buildInDegreeMap(nodes, edges);

    const depByKey = new Map<string, DepsDotDevDep>();
    for (const d of graph.dependencies) {
      if (d.distance > 0) depByKey.set(`${d.package.name}@${d.version}`, d);
    }

    const rawDeps: RawDep[] = [];
    const npmNames: string[] = [packageName];
    for (const node of nodes) {
      const key = `${node.package.name}@${node.version}`;
      const dep = depByKey.get(key);
      if (!dep) continue;

      rawDeps.push({
        name: dep.package.name,
        distance: dep.distance,
        inDegree: inDegreeMap.get(node.nodeID) ?? 0,
        subtreeSize: dep.dependencyCount,
      });
      npmNames.push(dep.package.name);
    }

    // Resolve npm→GitHub to collapse monorepo siblings (includes root package)
    const identifierMap = await batchResolveNpmToGithub(npmNames);
    const rootIdentifier = identifierMap.get(packageName) ?? `npmjs.com/package/${packageName}`;

    // Calculate raw weights and override identifiers with resolved GitHub repos
    const weighted = calculateWeights(rawDeps).map(d => ({
      ...d,
      identifier: identifierMap.get(d.name) ?? d.identifier,
    }));

    // Aggregate siblings that resolved to the same repo
    let aggregated = aggregateByIdentifier(weighted);

    // When rootShareBps > 0 the root already has a fixed carve-out,
    // so exclude deps that collapsed into the root identifier to avoid double-counting.
    if (rootShareBps > 0) {
      aggregated = aggregated.filter(d => d.identifier !== rootIdentifier);
    }

    aggregated.sort((a, b) => b.weight - a.weight);

    const uniqueEntities = aggregated.length;

    // Cap to maxAllocations, pool the remainder under the root package
    let finalDeps: WeightedDep[];
    if (aggregated.length > maxAllocations) {
      const top = aggregated.slice(0, maxAllocations - 1);
      const rest = aggregated.slice(maxAllocations - 1);
      const pooledWeight = rest.reduce((s, d) => s + d.weight, 0);
      top.push({
        name: `${rest.length} other dependencies`,
        distance: 0,
        inDegree: 0,
        subtreeSize: 0,
        weight: pooledWeight,
        identifier: rootIdentifier,
      });
      finalDeps = top;
    } else {
      finalDeps = aggregated;
    }

    // Carve out reserved shares (agent fee + root), deps split the remainder
    const reservedBps = agentFeeBps + rootShareBps;
    const normalized = normalizeWeights(finalDeps, reservedBps);

    const agentFeeEntry = normalized.find(d => d.name === "__agent_fee")!;
    const depEntries = normalized.filter(d => d.name !== "__agent_fee");

    const allocations = depEntries.map(d => ({
      identifier: d.identifier,
      name: d.name,
      weight: d.normalizedWeight,
      distance: d.distance,
      reason:
        d.distance === 0
          ? "Pooled long-tail dependencies"
          : d.distance === 1
            ? `Direct dep (inDeg=${d.inDegree}, sub=${d.subtreeSize})`
            : `Transitive dep dist=${d.distance} (inDeg=${d.inDegree}, sub=${d.subtreeSize})`,
    }));

    // Prepend root package allocation if rootShareBps > 0
    if (rootShareBps > 0) {
      allocations.unshift({
        identifier: rootIdentifier,
        name: packageName,
        weight: rootShareBps,
        distance: 0,
        reason: `Root package (fixed ${rootShareBps} bps)`,
      });
    }

    return {
      package: packageName,
      version: resolvedVersion,
      totalDependencies: rawDeps.length,
      uniqueEntities,
      directCount: graph.directCount,
      indirectCount: graph.indirectCount,
      allocations,
      agentFee: {
        recipient: agentAddress,
        weight: agentFeeBps,
        bps: agentFeeBps,
      },
    };
  },
});
