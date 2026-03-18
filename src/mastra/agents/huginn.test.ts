import { describe, it, expect, vi } from "vitest";

vi.mock("../lib/clients", () => ({
  walletClient: { chain: { id: 31337 } },
  publicClient: {},
  agentAddress: "0xAgent",
  chainId: 31337,
}));

vi.mock("@ethereum-entity-registry/sdk", () => ({
  EntityRegistrySDK: vi.fn().mockImplementation(function (this: any) {
    this.registry = { resolve: vi.fn() };
  }),
}));

vi.mock("@curator-studio/sdk", () => ({
  CuratorSDK: vi.fn().mockImplementation(function (this: any) {
    this.strategy = { create: vi.fn(), distribute: vi.fn(), balanceOf: vi.fn() };
  }),
  createUploadFn: vi.fn().mockReturnValue(vi.fn()),
  createIndexer: vi.fn().mockReturnValue({
    strategy: { get: vi.fn(), query: vi.fn() },
    strategyBalance: { query: vi.fn() },
    distribution: { query: vi.fn() },
  }),
}));

const { huginn } = await import("./huginn");

describe("huginn agent", () => {
  it("is defined with correct name", () => {
    expect(huginn).toBeDefined();
    expect(huginn.name).toBe("Huginn");
  });
});
