import { describe, it, expect, vi, beforeEach } from "vitest";

const MOCK_HASH = "0xdistributetxhash00000000000000000000000000000000000000000000000001";

let mockDistribute: ReturnType<typeof vi.fn>;

vi.mock("../../lib/clients", () => ({
  walletClient: { chain: { id: 31337 } },
  chainId: 31337,
}));

vi.mock("@curator-studio/sdk", () => ({
  CuratorSDK: vi.fn().mockImplementation(function (this: any) {
    this.strategy = {
      get distribute() {
        return mockDistribute;
      },
    };
  }),
}));

const { distribute } = await import("./index");

describe("distribute tool", () => {
  beforeEach(() => {
    mockDistribute = vi.fn().mockResolvedValue({ hash: MOCK_HASH });
  });

  it("returns the tx hash", async () => {
    const result = await distribute.execute({
      strategyAddress: "0xStrategy",
      token: "0xToken",
    });
    expect(result.txHash).toBe(MOCK_HASH);
  });

  it("calls SDK with the correct arguments", async () => {
    await distribute.execute({
      strategyAddress: "0xStrategy",
      token: "0xToken",
    });
    expect(mockDistribute).toHaveBeenCalledWith("0xStrategy", "0xToken");
  });
});
