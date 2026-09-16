/** 更新日志：读取后端聚合的 GitHub Releases。 */

export interface ChangelogItem {
  id: string;
  tag?: string;
  name?: string;
  body?: string;
  url?: string;
  author?: string;
  prerelease?: boolean;
  pinned?: boolean;
  hidden?: boolean;
  publishedAt?: number;
}

export async function fetchChangelog(limit = 20): Promise<ChangelogItem[]> {
  try {
    const res = await fetch(`/api/knowledge-system/ops/changelog?limit=${limit}`, { headers: { Accept: "application/json" } });
    if (!res.ok) return [];
    const json = (await res.json()) as { data?: ChangelogItem[] };
    return Array.isArray(json?.data) ? json.data : [];
  } catch {
    return [];
  }
}
