/**
 * NetEase Cloud Music API client
 *
 * Supports two modes:
 * 1. Direct API - uses public NetEase endpoints (limited, may have CORS issues)
 * 2. Proxy API - uses NeteaseCloudMusicApi service (full features, needs self-hosted)
 *
 * Reference: https://binaryify.github.io/NeteaseCloudMusicApi/
 */

export interface SearchResult {
    id: number
    name: string
    artists: Array<{ id: number; name: string }>
    album: { id: number; name: string; picUrl?: string }
    duration: number
}

export interface SongDetail {
    id: number
    name: string
    artists: string
    album: string
    coverUrl: string
    duration: number
}

/**
 * Test connection to a NeteaseCloudMusicApi service
 */
export async function testApiConnection(apiBaseUrl: string): Promise<{ success: boolean; error?: string }> {
    try {
        const url = apiBaseUrl.replace(/\/+$/, '')
        const resp = await fetch(`${url}/search?keywords=test&limit=1`, {
            method: 'GET',
            signal: AbortSignal.timeout(5000),
        })
        if (!resp.ok) {
            return { success: false, error: `HTTP ${resp.status}` }
        }
        const data = await resp.json()
        if (data.code === 200 || data.result) {
            return { success: true }
        }
        return { success: false, error: 'Unexpected response format' }
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : 'Connection failed' }
    }
}

/**
 * Search songs via NeteaseCloudMusicApi proxy
 */
export async function searchSongs(apiBaseUrl: string, keywords: string, limit = 20): Promise<SearchResult[]> {
    const url = apiBaseUrl.replace(/\/+$/, '')
    const resp = await fetch(`${url}/search?keywords=${encodeURIComponent(keywords)}&limit=${limit}`)
    if (!resp.ok) throw new Error(`Search failed: HTTP ${resp.status}`)
    const data = await resp.json()
    return data?.result?.songs || []
}

/**
 * Get song detail via NeteaseCloudMusicApi proxy
 */
export async function getSongDetail(apiBaseUrl: string, id: string): Promise<SongDetail | null> {
    const url = apiBaseUrl.replace(/\/+$/, '')
    const resp = await fetch(`${url}/song/detail?ids=${id}`)
    if (!resp.ok) return null
    const data = await resp.json()
    const song = data?.songs?.[0]
    if (!song) return null
    return {
        id: song.id,
        name: song.name,
        artists: song.ar?.map((a: any) => a.name).join(', ') || '',
        album: song.al?.name || '',
        coverUrl: song.al?.picUrl || '',
        duration: song.dt || 0,
    }
}
