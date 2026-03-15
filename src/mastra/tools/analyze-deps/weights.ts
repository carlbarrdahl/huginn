export type RawDep = {
  name: string;
  distance: number;
  inDegree: number;
  subtreeSize: number;
};

export type WeightedDep = RawDep & {
  weight: number;
  identifier: string;
};

export type NormalizedDep = WeightedDep & {
  normalizedWeight: number;
};

// Composite weight: distance decay × structural importance × subtree breadth
//   - 1/distance: smooth decay (direct=1, transitive at dist 2=0.5, dist 3=0.33, …)
//   - (1 + inDegree): packages depended on by many siblings score higher
//   - (1 + ln(1 + subtreeSize)): gateways to large subtrees score higher (diminishing returns)
export function compositeWeight(dep: RawDep): number {
  return (
    (1 / dep.distance) *
    (1 + dep.inDegree) *
    (1 + Math.log(1 + dep.subtreeSize))
  );
}

export function calculateWeights(deps: RawDep[]): WeightedDep[] {
  return deps.map(d => ({
    ...d,
    weight: compositeWeight(d),
    identifier: `npmjs.com/package/${d.name}`,
  }));
}

// reservedBps = total bps carved out before deps split (agent fee + root share etc.)
// The __agent_fee sentinel carries the full reservedBps so callers can decompose it.
export function normalizeWeights(
  deps: WeightedDep[],
  reservedBps: number
): NormalizedDep[] {
  const totalRaw = deps.reduce((sum, d) => sum + d.weight, 0);
  const depsShare = 10000 - reservedBps;

  const normalized: NormalizedDep[] = deps.map(d => ({
    ...d,
    normalizedWeight: Math.round((d.weight / totalRaw) * depsShare),
  }));

  const allocatedSum = normalized.reduce((s, d) => s + d.normalizedWeight, 0);
  if (normalized.length > 0) {
    normalized[normalized.length - 1].normalizedWeight += depsShare - allocatedSum;
  }

  normalized.push({
    name: "__agent_fee",
    distance: 0,
    inDegree: 0,
    subtreeSize: 0,
    weight: 0,
    identifier: "__agent_fee",
    normalizedWeight: reservedBps,
  });

  return normalized;
}
