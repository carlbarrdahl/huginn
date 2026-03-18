import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

vi.mock("../../lib/clients", () => ({
  agentAddress: "0xAgent",
}));

const { analyzeDeps } = await import("./index");

const MOCK_LATEST = { version: "2.47.4" };

// Each npm package resolves to a unique GitHub repo unless explicitly overridden
function npmRegistryResponse(name: string, githubRepo?: string) {
  const repo = githubRepo ?? `github.com/test/${name.replace("@", "").replace("/", "-")}`;
  return {
    ok: true,
    json: async () => ({ repository: { url: `git+https://${repo}.git` } }),
  };
}

const MOCK_DEPS_DEV = {
  package: { system: "NPM", name: "viem" },
  version: "2.47.4",
  dependencyCount: 3,
  directCount: 2,
  indirectCount: 1,
  dependencies: [
    { package: { system: "NPM", name: "viem" }, version: "2.47.4", distance: 0, dependencyCount: 3 },
    { package: { system: "NPM", name: "@noble/curves" }, version: "1.9.1", distance: 1, dependencyCount: 1 },
    { package: { system: "NPM", name: "ox" }, version: "0.6.7", distance: 1, dependencyCount: 0 },
    { package: { system: "NPM", name: "@noble/hashes" }, version: "1.8.0", distance: 2, dependencyCount: 0 },
  ],
  dependencyGraph: {
    nodes: [
      { package: { system: "NPM", name: "viem" }, version: "2.47.4", nodeID: 0 },
      { package: { system: "NPM", name: "@noble/curves" }, version: "1.9.1", nodeID: 1 },
      { package: { system: "NPM", name: "ox" }, version: "0.6.7", nodeID: 2 },
      { package: { system: "NPM", name: "@noble/hashes" }, version: "1.8.0", nodeID: 3 },
    ],
    edges: [
      { from: 0, to: 1 },
      { from: 0, to: 2 },
      { from: 1, to: 3 },
      { from: 2, to: 3 },
    ],
  },
};

function setupMocks(opts?: {
  skipLatest?: boolean;
  depsDevResponse?: any;
  githubOverrides?: Record<string, string>;
}) {
  mockFetch.mockReset();

  const responses: Array<{ ok: boolean; json: () => Promise<any> }> = [];

  if (!opts?.skipLatest) {
    responses.push({ ok: true, json: async () => MOCK_LATEST });
  }

  const depsResp = opts?.depsDevResponse ?? MOCK_DEPS_DEV;
  responses.push({ ok: true, json: async () => depsResp });

  // After deps.dev, the tool calls npm registry for each unique package name
  mockFetch.mockImplementation(async (url: string) => {
    const queued = responses.shift();
    if (queued) return queued;

    // npm registry calls for GitHub resolution
    for (const [pkg, repo] of Object.entries(opts?.githubOverrides ?? {})) {
      if (url.includes(encodeURIComponent(pkg)) || url.includes(pkg)) {
        return npmRegistryResponse(pkg, repo);
      }
    }
    // Default: unique repo per package
    const nameMatch = url.match(/registry\.npmjs\.org\/(.+)/);
    if (nameMatch) {
      const name = decodeURIComponent(nameMatch[1]);
      return npmRegistryResponse(name);
    }
    return { ok: false };
  });
}

describe("analyzeDeps tool", () => {
  it("returns weighted allocations with GitHub-resolved identifiers", async () => {
    setupMocks();

    const result = await analyzeDeps.execute({
      packageName: "viem",
      agentFeeBps: 200,
    });

    expect(result.package).toBe("viem");
    expect(result.version).toBe("2.47.4");
    expect(result.totalDependencies).toBe(3);

    const curves = result.allocations.find(a => a.name === "@noble/curves");
    expect(curves).toBeDefined();
    expect(curves!.identifier).toContain("github.com/");

    const depTotal = result.allocations.reduce((s, a) => s + a.weight, 0);
    expect(depTotal + result.agentFee.weight).toBe(10000);
  });

  it("deduplicates monorepo siblings by GitHub repo", async () => {
    const monorepo = {
      ...MOCK_DEPS_DEV,
      dependencies: [
        { package: { system: "NPM", name: "viem" }, version: "2.47.4", distance: 0, dependencyCount: 2 },
        { package: { system: "NPM", name: "@lodestar/api" }, version: "1.0.0", distance: 1, dependencyCount: 0 },
        { package: { system: "NPM", name: "@lodestar/types" }, version: "1.0.0", distance: 1, dependencyCount: 0 },
      ],
      dependencyGraph: {
        nodes: [
          { package: { system: "NPM", name: "viem" }, version: "2.47.4", nodeID: 0 },
          { package: { system: "NPM", name: "@lodestar/api" }, version: "1.0.0", nodeID: 1 },
          { package: { system: "NPM", name: "@lodestar/types" }, version: "1.0.0", nodeID: 2 },
        ],
        edges: [
          { from: 0, to: 1 },
          { from: 0, to: 2 },
        ],
      },
    };

    setupMocks({
      depsDevResponse: monorepo,
      githubOverrides: {
        "@lodestar/api": "github.com/chainsafe/lodestar",
        "@lodestar/types": "github.com/chainsafe/lodestar",
      },
    });

    const result = await analyzeDeps.execute({
      packageName: "viem",
      agentFeeBps: 200,
    });

    // Both @lodestar/* packages should merge into one allocation
    expect(result.allocations).toHaveLength(1);
    expect(result.allocations[0].identifier).toBe("github.com/chainsafe/lodestar");
    expect(result.allocations[0].name).toContain("+ 1 more");
    expect(result.uniqueEntities).toBe(1);
  });

  it("pools long-tail into 'other dependencies' when exceeding maxAllocations", async () => {
    // Create 5 deps, set maxAllocations to 3
    const manyDeps = {
      ...MOCK_DEPS_DEV,
      dependencies: [
        { package: { system: "NPM", name: "root" }, version: "1.0.0", distance: 0, dependencyCount: 5 },
        { package: { system: "NPM", name: "a" }, version: "1.0.0", distance: 1, dependencyCount: 5 },
        { package: { system: "NPM", name: "b" }, version: "1.0.0", distance: 1, dependencyCount: 3 },
        { package: { system: "NPM", name: "c" }, version: "1.0.0", distance: 1, dependencyCount: 1 },
        { package: { system: "NPM", name: "d" }, version: "1.0.0", distance: 2, dependencyCount: 0 },
        { package: { system: "NPM", name: "e" }, version: "1.0.0", distance: 2, dependencyCount: 0 },
      ],
      dependencyGraph: {
        nodes: [
          { package: { system: "NPM", name: "root" }, version: "1.0.0", nodeID: 0 },
          { package: { system: "NPM", name: "a" }, version: "1.0.0", nodeID: 1 },
          { package: { system: "NPM", name: "b" }, version: "1.0.0", nodeID: 2 },
          { package: { system: "NPM", name: "c" }, version: "1.0.0", nodeID: 3 },
          { package: { system: "NPM", name: "d" }, version: "1.0.0", nodeID: 4 },
          { package: { system: "NPM", name: "e" }, version: "1.0.0", nodeID: 5 },
        ],
        edges: [
          { from: 0, to: 1 }, { from: 0, to: 2 }, { from: 0, to: 3 },
          { from: 1, to: 4 }, { from: 2, to: 5 },
        ],
      },
    };

    setupMocks({ depsDevResponse: manyDeps });

    const result = await analyzeDeps.execute({
      packageName: "root",
      agentFeeBps: 200,
      maxAllocations: 3,
    });

    // 2 top allocations + 1 pooled "other" = 3
    expect(result.allocations).toHaveLength(3);
    const pooled = result.allocations.find(a => a.name.includes("other dependencies"));
    expect(pooled).toBeDefined();
    expect(pooled!.reason).toBe("Pooled long-tail dependencies");

    const depTotal = result.allocations.reduce((s, a) => s + a.weight, 0);
    expect(depTotal + result.agentFee.weight).toBe(10000);
  });

  it("uses provided version without fetching latest", async () => {
    setupMocks({ skipLatest: true });

    const result = await analyzeDeps.execute({
      packageName: "viem",
      version: "2.47.4",
      agentFeeBps: 200,
    });

    expect(result.version).toBe("2.47.4");
  });

  it("carves out rootShareBps for the root package", async () => {
    setupMocks();

    const result = await analyzeDeps.execute({
      packageName: "viem",
      agentFeeBps: 200,
      rootShareBps: 5000,
    });

    const root = result.allocations.find(a => a.name === "viem");
    expect(root).toBeDefined();
    expect(root!.weight).toBe(5000);
    expect(root!.reason).toContain("Root package");
    expect(root!.identifier).toContain("github.com/");

    // deps get 10000 - 200 (agent) - 5000 (root) = 4800
    const depsOnly = result.allocations.filter(a => a.name !== "viem");
    const depsTotal = depsOnly.reduce((s, a) => s + a.weight, 0);
    expect(depsTotal + root!.weight + result.agentFee.weight).toBe(10000);
  });

  it("excludes deps sharing root identifier when rootShareBps > 0", async () => {
    const monorepo = {
      ...MOCK_DEPS_DEV,
      dependencies: [
        { package: { system: "NPM", name: "wagmi" }, version: "2.0.0", distance: 0, dependencyCount: 2 },
        { package: { system: "NPM", name: "@wagmi/connectors" }, version: "1.0.0", distance: 1, dependencyCount: 0 },
        { package: { system: "NPM", name: "zustand" }, version: "4.0.0", distance: 1, dependencyCount: 0 },
      ],
      dependencyGraph: {
        nodes: [
          { package: { system: "NPM", name: "wagmi" }, version: "2.0.0", nodeID: 0 },
          { package: { system: "NPM", name: "@wagmi/connectors" }, version: "1.0.0", nodeID: 1 },
          { package: { system: "NPM", name: "zustand" }, version: "4.0.0", nodeID: 2 },
        ],
        edges: [{ from: 0, to: 1 }, { from: 0, to: 2 }],
      },
    };

    setupMocks({
      depsDevResponse: monorepo,
      githubOverrides: {
        "wagmi": "github.com/wevm/wagmi",
        "@wagmi/connectors": "github.com/wevm/wagmi",
        "zustand": "github.com/pmndrs/zustand",
      },
    });

    const result = await analyzeDeps.execute({
      packageName: "wagmi",
      agentFeeBps: 200,
      rootShareBps: 5000,
    });

    // @wagmi/connectors shares the root identifier, should be excluded from deps
    const wagmiDep = result.allocations.find(a => a.identifier === "github.com/wevm/wagmi" && a.name !== "wagmi");
    expect(wagmiDep).toBeUndefined();

    // Root gets exactly 5000, zustand gets the rest of 4800
    const root = result.allocations.find(a => a.name === "wagmi")!;
    expect(root.weight).toBe(5000);

    const zustand = result.allocations.find(a => a.identifier === "github.com/pmndrs/zustand")!;
    expect(zustand).toBeDefined();
    expect(zustand.weight).toBe(4800);

    const total = result.allocations.reduce((s, a) => s + a.weight, 0) + result.agentFee.weight;
    expect(total).toBe(10000);
  });

  it("defaults rootShareBps to 0 (no root allocation)", async () => {
    setupMocks();

    const result = await analyzeDeps.execute({
      packageName: "viem",
      agentFeeBps: 200,
    });

    const root = result.allocations.find(a => a.name === "viem");
    expect(root).toBeUndefined();
  });
});
