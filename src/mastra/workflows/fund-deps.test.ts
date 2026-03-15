import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

const { mockRegistryResolve, mockStrategyCreate } = vi.hoisted(() => ({
  mockRegistryResolve: vi.fn().mockResolvedValue({
    id: "0x" + "ab".repeat(32),
    depositAddress: "0xdeadbeef00000000000000000000000000000001",
    owner: null,
    balance: null,
  }),
  mockStrategyCreate: vi.fn().mockResolvedValue({
    strategy: "0xStrategyDeployed00000000000000000000000001",
    config: {},
  }),
}));

vi.mock("@ethereum-entity-registry/sdk", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@ethereum-entity-registry/sdk")>();
  return {
    ...actual,
    EntityRegistrySDK: vi.fn().mockImplementation(function (this: any) {
      this.registry = { resolve: mockRegistryResolve };
    }),
  };
});

vi.mock("@curator-studio/sdk", () => ({
  CuratorSDK: vi.fn().mockImplementation(function (this: any) {
    this.strategy = { create: mockStrategyCreate };
    this.tenant = undefined;
  }),
  createUploadFn: vi.fn().mockReturnValue(async () => "data:application/json;base64,e30="),
}));

vi.mock("../lib/clients", () => ({
  createClients: vi.fn().mockReturnValue({
    walletClient: { chain: { id: 31337 } },
    account: { address: "0xAgent" },
    chainId: 31337,
  }),
  
}));

const MOCK_LATEST = { version: "2.47.4" };
const MOCK_DEPS_DEV = {
  package: { system: "NPM", name: "viem" },
  version: "2.47.4",
  dependencyCount: 1,
  directCount: 1,
  indirectCount: 0,
  dependencies: [
    { package: { system: "NPM", name: "viem" }, version: "2.47.4", distance: 0, dependencyCount: 1 },
    { package: { system: "NPM", name: "@noble/curves" }, version: "1.9.1", distance: 1, dependencyCount: 0 },
  ],
  dependencyGraph: {
    nodes: [
      { package: { system: "NPM", name: "viem" }, version: "2.47.4", nodeID: 0 },
      { package: { system: "NPM", name: "@noble/curves" }, version: "1.9.1", nodeID: 1 },
    ],
    edges: [{ from: 0, to: 1 }],
  },
};

const { fundDepsWorkflow } = await import("./fund-deps");

describe("fundDepsWorkflow", () => {
  beforeEach(() => {
    mockFetch.mockReset();

    const npmGithubResponse = (repo: string) => ({
      ok: true,
      json: async () => ({ repository: { url: `https://github.com/${repo}` } }),
    });

    const responses = [
      { ok: true, json: async () => MOCK_LATEST },          // npm latest
      { ok: true, json: async () => MOCK_DEPS_DEV },        // deps.dev
    ];

    mockFetch.mockImplementation(async (url: string) => {
      const queued = responses.shift();
      if (queued) return queued;
      // npm registry calls for GitHub resolution
      if (url.includes("registry.npmjs.org")) {
        if (url.includes("noble")) return npmGithubResponse("paulmillr/noble-curves");
        return npmGithubResponse("wevm/viem");
      }
      return { ok: false };
    });
  });

  it("is defined", () => {
    expect(fundDepsWorkflow).toBeDefined();
  });

  it("runs end-to-end and returns a strategy address", async () => {
    const run = await fundDepsWorkflow.createRun();
    const result = await run.start({
      inputData: { packageName: "viem", agentFeeBps: 200 },
    });
    expect(result.status).toBe("success");
    expect(result.result?.strategyAddress).toMatch(/^0x/);
  });
});
