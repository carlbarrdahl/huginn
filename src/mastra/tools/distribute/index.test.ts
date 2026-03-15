import { describe, it, expect, vi } from "vitest";

const { mockDistribute, MOCK_HASH } = vi.hoisted(() => ({
  MOCK_HASH: "0xdistributetxhash00000000000000000000000000000000000000000000000001",
  mockDistribute: vi.fn().mockResolvedValue({ hash: "0xdistributetxhash00000000000000000000000000000000000000000000000001" }),
}));

vi.mock("../../lib/clients", () => ({
  createClients: vi.fn().mockReturnValue({
    walletClient: { chain: { id: 31337 } },
    chainId: 31337,
  }),
  
}));

vi.mock("@curator-studio/sdk", () => ({
  CuratorSDK: vi.fn().mockImplementation(function (this: any) {
    this.strategy = { distribute: mockDistribute };
  }),
}));

const { distribute } = await import("./index");

describe("distribute tool", () => {
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
