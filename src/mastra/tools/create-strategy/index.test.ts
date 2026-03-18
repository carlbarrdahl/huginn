import { describe, it, expect, vi, beforeEach } from "vitest";

let mockStrategyCreate: ReturnType<typeof vi.fn>;

vi.mock("../../lib/clients", () => ({
  walletClient: { chain: { id: 31337 } },
  agentAddress: "0xAgent",
  chainId: 31337,
}));

vi.mock("@curator-studio/sdk", () => ({
  CuratorSDK: vi.fn().mockImplementation(function (this: any) {
    this.strategy = {
      get create() {
        return mockStrategyCreate;
      },
    };
    this.tenant = undefined;
  }),
  createUploadFn: vi.fn().mockReturnValue(async () => "data:application/json;base64,e30="),
}));

const { createStrategy } = await import("./index");

describe("createStrategy tool", () => {
  beforeEach(() => {
    mockStrategyCreate = vi.fn().mockResolvedValue({
      strategy: "0xStrategyDeployed00000000000000000000000001",
      config: {},
    });
  });

  it("deploys a strategy and returns its address", async () => {
    const result = await createStrategy.execute({
      allocations: [
        { recipient: "0xabc000000000000000000000000000000000001", weight: 9800, label: "viem (unclaimed)" },
        { recipient: "0xfee000000000000000000000000000000000001", weight: 200, label: "Huginn Agent Fee" },
      ],
    });
    expect(result.strategyAddress).toBe("0xStrategyDeployed00000000000000000000000001");
  });

  it("converts weights to bigint", async () => {
    await createStrategy.execute({
      allocations: [{ recipient: "0xabc000000000000000000000000000000000001", weight: 10000, label: "viem" }],
    });
    const call = mockStrategyCreate.mock.calls[0][0];
    expect(call.allocations[0].weight).toBe(10000n);
  });

  it("uses provided title in metadata", async () => {
    await createStrategy.execute({
      allocations: [{ recipient: "0xabc000000000000000000000000000000000001", weight: 10000, label: "viem" }],
      title: "viem Dependency Funding",
    });
    const call = mockStrategyCreate.mock.calls[0][0];
    expect(call.metadata.title).toBe("viem Dependency Funding");
  });

  it("merges duplicate recipients (monorepo siblings)", async () => {
    const shared = "0xMonoRepo0000000000000000000000000000001";
    await createStrategy.execute({
      allocations: [
        { recipient: shared, weight: 500, label: "@lodestar/api" },
        { recipient: shared, weight: 300, label: "@lodestar/config" },
        { recipient: shared, weight: 200, label: "@lodestar/types" },
        { recipient: "0xOther00000000000000000000000000000000001", weight: 9000, label: "other" },
      ],
    });

    const call = mockStrategyCreate.mock.calls[0][0];
    expect(call.allocations).toHaveLength(2);

    const merged = call.allocations.find((a: any) => a.recipient === shared);
    expect(merged.weight).toBe(1000n);
    expect(merged.label).toBe("@lodestar/api + 2 more");
  });
});
