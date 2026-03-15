import { describe, it, expect, vi, beforeAll } from "vitest";

const mockStrategyGet = vi.fn();
const mockStrategyQuery = vi.fn();
const mockBalanceQuery = vi.fn();
const mockDistributionQuery = vi.fn();

vi.stubEnv("CURATOR_INDEXER_URL", "http://test/graphql");

vi.mock("@curator-studio/sdk", () => ({
  createIndexer: vi.fn().mockReturnValue({
    strategy: { get: mockStrategyGet, query: mockStrategyQuery },
    strategyBalance: { query: mockBalanceQuery },
    distribution: { query: mockDistributionQuery },
  }),
}));

const { listStrategies, getStrategy, strategyBalances, listDistributions } = await import("./index");

const MOCK_STRATEGY = {
  id: "0xStrategy1",
  owner: "0xOwner",
  metadata: { title: "wagmi Dependency Funding" },
  allocations: [{ recipient: "0xRecipient", weight: "10000", label: "wagmi" }],
  uniqueDonors: 5,
  timesForked: 2,
  createdAt: 1234567890,
};

describe("listStrategies", () => {
  it("returns strategies from the indexer", async () => {
    mockStrategyQuery.mockResolvedValueOnce({
      items: [MOCK_STRATEGY],
      totalCount: 1,
      pageInfo: { hasNextPage: false },
    });

    const result = await listStrategies.execute({ limit: 10 });

    expect(result.strategies).toHaveLength(1);
    expect(result.strategies[0].id).toBe("0xStrategy1");
    expect(result.totalCount).toBe(1);
  });
});

describe("getStrategy", () => {
  it("returns a single strategy by address", async () => {
    mockStrategyGet.mockResolvedValueOnce(MOCK_STRATEGY);

    const result = await getStrategy.execute({ strategyAddress: "0xStrategy1" });

    expect(result.strategy).toBeDefined();
    expect(result.strategy!.metadata!.title).toBe("wagmi Dependency Funding");
  });

  it("returns null for unknown strategy", async () => {
    mockStrategyGet.mockResolvedValueOnce(null);

    const result = await getStrategy.execute({ strategyAddress: "0xUnknown" });
    expect(result.strategy).toBeNull();
  });
});

describe("strategyBalances", () => {
  it("returns token balances for a strategy", async () => {
    mockBalanceQuery.mockResolvedValueOnce({
      items: [{
        token: "0xUSDC",
        balance: "1000000",
        totalReceived: "5000000",
        totalDistributed: "4000000",
        totalReceivedUSD: "5.00",
        totalDistributedUSD: "4.00",
      }],
      totalCount: 1,
    });

    const result = await strategyBalances.execute({ strategyAddress: "0xStrategy1" });

    expect(result.balances).toHaveLength(1);
    expect(result.balances[0].token).toBe("0xUSDC");
    expect(result.balances[0].balance).toBe("1000000");
  });
});

describe("listDistributions", () => {
  it("returns past distributions for a strategy", async () => {
    mockDistributionQuery.mockResolvedValueOnce({
      items: [{
        id: "dist-1",
        token: "0xUSDC",
        totalAmount: "5000000",
        totalAmountUSD: "5.00",
        timestamp: 1234567890,
        txHash: "0xTx1",
      }],
      totalCount: 1,
    });

    const result = await listDistributions.execute({
      strategyAddress: "0xStrategy1",
      limit: 10,
    });

    expect(result.distributions).toHaveLength(1);
    expect(result.totalCount).toBe(1);
  });
});
