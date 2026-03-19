import { describe, it, expect, vi, beforeEach } from "vitest";

const mockReadContract = vi.fn();
const mockWriteContract = vi.fn();
const mockSendTransaction = vi.fn();

vi.mock("../../lib/clients", () => ({
  walletClient: {
    writeContract: mockWriteContract,
    sendTransaction: mockSendTransaction,
    account: { address: "0xAgent" },
  },
  publicClient: { readContract: mockReadContract },
  agentAddress: "0xAgent",
  chainId: 31337,
}));

const { fundStrategy } = await import("./index");

describe("fundStrategy tool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

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

  it("sends native ETH when no token is provided", async () => {
    mockSendTransaction.mockResolvedValueOnce("0xEthTxHash");

    const result = await fundStrategy.execute({
      strategyAddress: "0xStrategy",
      amount: "0.1",
    });

    expect(result.txHash).toBe("0xEthTxHash");
    expect(result.token).toBe("ETH");
    expect(result.amount).toBe("0.1");

    expect(mockSendTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "0xStrategy",
        value: 100_000_000_000_000_000n,
      })
    );
    expect(mockReadContract).not.toHaveBeenCalled();
  });
});
