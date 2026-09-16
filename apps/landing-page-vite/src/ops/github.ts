/** GitHub 社交证明：star 数，带 1 小时本地缓存，避免触发 API 限流。 */

const CACHE_KEY = "kn.ops.github-stars";
const CACHE_TTL = 60 * 60 * 1000;

interface CacheShape {
  value: number;
  at: number;
}

export async function fetchGitHubStars(repo = "LRF0422/knowledge-repo"): Promise<number | null> {
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as CacheShape;
      if (parsed && typeof parsed.value === "number" && Date.now() - parsed.at < CACHE_TTL) {
        return parsed.value;
      }
    }
  } catch {
    /* ignore */
  }

  try {
    const res = await fetch(`https://api.github.com/repos/${repo}`, {
      headers: { Accept: "application/vnd.github+json" },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { stargazers_count?: number };
    const value = typeof json.stargazers_count === "number" ? json.stargazers_count : null;
    if (value !== null) {
      window.localStorage.setItem(CACHE_KEY, JSON.stringify({ value, at: Date.now() } satisfies CacheShape));
    }
    return value;
  } catch {
    return null;
  }
}
