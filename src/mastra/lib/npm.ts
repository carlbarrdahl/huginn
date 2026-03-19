const NPM_REGISTRY_API = "https://registry.npmjs.org";

export async function fetchLatestVersion(packageName: string): Promise<string> {
  const res = await fetch(`${NPM_REGISTRY_API}/${encodeURIComponent(packageName)}/latest`);
  if (!res.ok) throw new Error(`npm registry error ${res.status}: ${packageName}`);
  const data = await res.json();
  return data.version as string;
}

export async function resolveNpmToGithub(packageName: string): Promise<string | null> {
  try {
    const res = await fetch(`${NPM_REGISTRY_API}/${encodeURIComponent(packageName)}`);
    if (!res.ok) return null;
    const data = await res.json();
    const repoUrl: string | undefined = data.repository?.url;
    if (!repoUrl?.includes("github.com")) return null;
    const match = repoUrl.match(/github\.com\/([^/]+\/[^/.]+)/);
    return match ? `github.com/${match[1].toLowerCase()}` : null;
  } catch {
    return null;
  }
}

// Batch-resolve npm packages to GitHub repos with concurrency limit
export async function batchResolveNpmToGithub(
  packageNames: string[],
  concurrency = 10
): Promise<Map<string, string>> {
  const results = new Map<string, string>();
  const unique = [...new Set(packageNames)];

  for (let i = 0; i < unique.length; i += concurrency) {
    const batch = unique.slice(i, i + concurrency);
    const resolved = await Promise.all(batch.map(async name => {
      const github = await resolveNpmToGithub(name);
      return [name, github ?? `npmjs.com/package/${name}`] as const;
    }));
    for (const [name, identifier] of resolved) {
      results.set(name, identifier);
    }
  }

  return results;
}
