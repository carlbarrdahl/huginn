import { describe, it, expect, vi } from "vitest";

const mockReadContract = vi.fn();
const mockWriteContract = vi.fn();

vi.mock("../../lib/clients", () => ({
  walletClient: { writeContract: mockWriteContract, account: { address: "0xAgent" } },
  publicClient: { readContract: mockReadContract },
  agentAddress: "0xAgent",
  chainId: 31337,
}));

const { fundStrategy } = await import("./index");

describe("fundStrategy tool", () => {
  it("transfers ERC-20 tokens to the strategy address", async () => {
    mockReadContract.mockResolvedValueOnce(6);
    mockWriteContract.mockResolvedValueOnce("0xTxHash123");

    const result = await fundStrategy.execute({
      strategyAddress: "0xStrategy",
      token: "0xUSDC",
      amount: "100",
    });

    expect(result.txHash).toBe("0xTxHash123");
    expect(result.amount).toBe("100");
    expect(result.token).toBe("0xUSDC");

    expect(mockReadContract).toHaveBeenCalledWith(
      expect.objectContaining({ functionName: "decimals" })
    );
    expect(mockWriteContract).toHaveBeenCalledWith(
      expect.objectContaining({
        functionName: "transfer",
        args: ["0xStrategy", 100_000_000n],
      })
    );
  });
});
