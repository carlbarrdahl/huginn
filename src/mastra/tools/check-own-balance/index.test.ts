import { describe, it, expect, vi, beforeEach } from "vitest";

const AGENT_ADDRESS = "0xAgentAddress";

vi.mock("../../lib/clients", () => ({
  agentAddress: AGENT_ADDRESS,
  publicClient: {
    getBalance: vi.fn(),
    readContract: vi.fn(),
  },
}));

const { checkOwnBalance } = await import("./index");
const { publicClient } = await import("../../lib/clients");

describe("checkOwnBalance tool", () => {
  beforeEach(() => {
    vi.mocked(publicClient.getBalance).mockResolvedValue(
      BigInt("2000000000000000000"),
    );
    vi.mocked(publicClient.readContract).mockResolvedValue(
      BigInt("500000000"),
    );
  });

  it("returns ETH balance when no token is provided", async () => {
    const result = await checkOwnBalance.execute({});
    expect(result.balance).toBe("2000000000000000000");
    expect(result.address).toBe(AGENT_ADDRESS);
    expect(publicClient.getBalance).toHaveBeenCalledWith({
      address: AGENT_ADDRESS,
    });
  });

  it("returns ERC-20 balance when a token address is provided", async () => {
    const result = await checkOwnBalance.execute({ token: "0xTokenAddress" });
    expect(result.balance).toBe("500000000");
    expect(result.address).toBe(AGENT_ADDRESS);
    expect(publicClient.readContract).toHaveBeenCalledWith(
      expect.objectContaining({
        address: "0xTokenAddress",
        functionName: "balanceOf",
        args: [AGENT_ADDRESS],
      }),
    );
  });
});
