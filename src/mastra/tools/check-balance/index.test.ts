import { describe, it, expect, vi, beforeEach } from "vitest";

let mockBalanceOf: ReturnType<typeof vi.fn>;

vi.mock("../../lib/clients", () => ({
  walletClient: { chain: { id: 31337 } },
  chainId: 31337,
}));

vi.mock("@curator-studio/sdk", () => ({
  CuratorSDK: vi.fn().mockImplementation(function (this: any) {
    this.strategy = {
      get balanceOf() {
        return mockBalanceOf;
      },
    };
  }),
}));

const { checkBalance } = await import("./index");

describe("checkBalance tool", () => {
  beforeEach(() => {
    mockBalanceOf = vi.fn().mockResolvedValue(BigInt("5000000000000000000"));
  });

  it("returns balance as string", async () => {
    const result = await checkBalance.execute({
      strategyAddress: "0xStrategy",
      token: "0xToken",
    });
    expect(result.balance).toBe("5000000000000000000");
  });

  it("calls SDK with the correct arguments", async () => {
    await checkBalance.execute({
      strategyAddress: "0xStrategy",
      token: "0xToken",
    });
    expect(mockBalanceOf).toHaveBeenCalledWith("0xStrategy", "0xToken");
  });
});
