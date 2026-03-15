import { describe, it, expect } from "vitest";
import { compositeWeight, calculateWeights, normalizeWeights } from "./weights";

describe("compositeWeight", () => {
  it("gives higher weight to direct than transitive (same inDeg/subtree)", () => {
    const direct = compositeWeight({ name: "a", distance: 1, inDegree: 1, subtreeSize: 0 });
    const transitive = compositeWeight({ name: "b", distance: 2, inDegree: 1, subtreeSize: 0 });
    expect(direct).toBeGreaterThan(transitive);
  });

  it("boosts weight for higher in-degree", () => {
    const low = compositeWeight({ name: "a", distance: 1, inDegree: 1, subtreeSize: 0 });
    const high = compositeWeight({ name: "b", distance: 1, inDegree: 5, subtreeSize: 0 });
    expect(high).toBeGreaterThan(low);
  });

  it("boosts weight for larger subtree", () => {
    const leaf = compositeWeight({ name: "a", distance: 1, inDegree: 1, subtreeSize: 0 });
    const gateway = compositeWeight({ name: "b", distance: 1, inDegree: 1, subtreeSize: 10 });
    expect(gateway).toBeGreaterThan(leaf);
  });

  it("high-inDegree transitive can beat low-inDegree direct", () => {
    const directLeaf = compositeWeight({ name: "a", distance: 1, inDegree: 1, subtreeSize: 0 });
    // dist=2 but inDeg=5 (many siblings depend on it)
    const transitiveFoundation = compositeWeight({ name: "b", distance: 2, inDegree: 5, subtreeSize: 0 });
    expect(transitiveFoundation).toBeGreaterThan(directLeaf);
  });
});

describe("calculateWeights", () => {
  it("computes composite weight and sets identifier", () => {
    const deps = [
      { name: "@noble/curves", distance: 1, inDegree: 3, subtreeSize: 1 },
      { name: "ox", distance: 1, inDegree: 1, subtreeSize: 0 },
      { name: "@noble/hashes", distance: 2, inDegree: 4, subtreeSize: 0 },
    ];
    const result = calculateWeights(deps);

    expect(result[0].identifier).toBe("npmjs.com/package/@noble/curves");
    expect(result[0].weight).toBeGreaterThan(result[1].weight);
    // hashes (dist=2, inDeg=4) should beat ox (dist=1, inDeg=1, sub=0)
    const hashes = result.find(d => d.name === "@noble/hashes")!;
    const ox = result.find(d => d.name === "ox")!;
    expect(hashes.weight).toBeGreaterThan(ox.weight);
  });
});

describe("normalizeWeights", () => {
  it("returns weights that sum to 10000 bps", () => {
    const deps = [
      { name: "@noble/curves", distance: 1, inDegree: 1, subtreeSize: 1, weight: 3.39, identifier: "npmjs.com/package/@noble/curves" },
      { name: "@noble/hashes", distance: 2, inDegree: 2, subtreeSize: 0, weight: 1.50, identifier: "npmjs.com/package/@noble/hashes" },
    ];
    const result = normalizeWeights(deps, 200);
    const total = result.reduce((sum, d) => sum + d.normalizedWeight, 0);
    expect(total).toBe(10000);
    expect(result.find(d => d.name === "__agent_fee")!.normalizedWeight).toBe(200);
  });

  it("gives higher normalized weight to higher raw weight", () => {
    const deps = [
      { name: "high", distance: 1, inDegree: 3, subtreeSize: 5, weight: 10, identifier: "npmjs.com/package/high" },
      { name: "low", distance: 2, inDegree: 1, subtreeSize: 0, weight: 1, identifier: "npmjs.com/package/low" },
    ];
    const result = normalizeWeights(deps, 200);
    const high = result.find(d => d.name === "high")!;
    const low = result.find(d => d.name === "low")!;
    expect(high.normalizedWeight).toBeGreaterThan(low.normalizedWeight);
  });
});
