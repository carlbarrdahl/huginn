import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

const { mockRegistryResolve, MOCK_DEPOSIT_ADDRESS, MOCK_OWNER, MOCK_ID } = vi.hoisted(() => ({
  MOCK_DEPOSIT_ADDRESS: "0x54F9929e4C57f4E6430ecfC27EcB16376b950A21",
  MOCK_OWNER: "0xdeadbeef00000000000000000000000000000002",
  MOCK_ID: "0x" + "ab".repeat(32),
  mockRegistryResolve: vi.fn().mockResolvedValue({
    id: "0x" + "ab".repeat(32),
    depositAddress: "0x54F9929e4C57f4E6430ecfC27EcB16376b950A21",
    owner: null,
    balance: null,
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

vi.mock("../../lib/clients", () => ({
  walletClient: { chain: { id: 31337 } },
  chainId: 31337,
}));

const { resolveEntity } = await import("./index");

describe("resolveEntity tool", () => {
  beforeEach(() => {
    mockRegistryResolve.mockReset();
    mockFetch.mockReset();
    mockRegistryResolve.mockResolvedValue({
      id: MOCK_ID,
      depositAddress: MOCK_DEPOSIT_ADDRESS,
      owner: null,
      balance: null,
    });
  });

  it("resolves a github identifier to an identity account address (unclaimed)", async () => {
    const result = await resolveEntity.execute({ identifier: "github.com/wevm/viem" });

    expect(mockRegistryResolve).toHaveBeenCalledWith("github.com/wevm/viem", undefined);
    expect(result.address).toBe(MOCK_DEPOSIT_ADDRESS);
    expect(result.owner).toBeNull();
    expect(result.status).toBe("unclaimed");
    expect(result.id).toBe(MOCK_ID);
    expect(result.resolvedAs).toBe("github.com/wevm/viem");
  });

  it("returns claimed status when owner is set", async () => {
    mockRegistryResolve.mockResolvedValueOnce({
      id: MOCK_ID,
      depositAddress: MOCK_DEPOSIT_ADDRESS,
      owner: MOCK_OWNER,
      balance: null,
    });

    const result = await resolveEntity.execute({ identifier: "github.com/wevm/viem" });
    expect(result.status).toBe("claimed");
    expect(result.owner).toBe(MOCK_OWNER);
  });

  it("resolves npm package to github first", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ repository: { url: "https://github.com/paulmillr/noble-curves" } }),
    });

    const result = await resolveEntity.execute({ identifier: "npmjs.com/package/@noble/curves" });

    expect(result.resolvedAs).toBe("github.com/paulmillr/noble-curves");
    expect(mockRegistryResolve).toHaveBeenCalledWith("github.com/paulmillr/noble-curves", undefined);
  });

  it("falls back to npm identifier if no github link", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ repository: null }),
    });

    const result = await resolveEntity.execute({ identifier: "npmjs.com/package/no-github" });
    expect(result.resolvedAs).toBe("npmjs.com/package/no-github");
  });

  it("passes token to registry resolve for balance check", async () => {
    mockRegistryResolve.mockResolvedValueOnce({
      id: MOCK_ID,
      depositAddress: MOCK_DEPOSIT_ADDRESS,
      owner: null,
      balance: BigInt("1000000"),
    });

    const result = await resolveEntity.execute({
      identifier: "github.com/org/repo",
      token: "0xfa7D7ffb095d8cCe55B64498A1fdD871B1006Bb7",
    });

    expect(mockRegistryResolve).toHaveBeenCalledWith(
      "github.com/org/repo",
      "0xfa7D7ffb095d8cCe55B64498A1fdD871B1006Bb7"
    );
    expect(result.balance).toBe("1000000");
  });
});
