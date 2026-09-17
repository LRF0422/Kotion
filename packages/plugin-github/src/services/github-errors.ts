/**
 * Translate cryptic GitHub REST errors into actionable guidance for the user.
 *
 * GitHub returns 403/404 "Resource not accessible by personal access token"
 * whenever a fine-grained token lacks the scope for an endpoint. The raw text
 * does not tell the user what to change, so we map it to the exact permission.
 */
export function describeGitHubError(error: any): string {
    const status = error?.status
    const message = String(error?.message || '')

    if (/Resource not accessible by (personal access token|integration)/i.test(message)) {
        return 'Token 权限不足：GitHub 拒绝了该操作。读取需要 repo / Contents 读权限；创建或修改 release 需要写权限——'
            + '细粒度 PAT 请授予 “Contents: Read and write”，经典 PAT 请勾选 “repo” scope，并确保该仓库在 token 的授权范围内。'
    }
    if (status === 401) return '认证失败：Personal Access Token 无效或已过期。'
    if (status === 403 && /rate limit/i.test(message)) return '已触发 GitHub API 速率限制，请稍后重试。'
    if (status === 403) return 'GitHub 拒绝访问（403）：可能是 token 权限不足或仓库访问受限。' + (message ? ' 详情：' + message : '')
    if (status === 404) return '未找到资源，或 token 无权访问该仓库（细粒度 token 需将该仓库加入授权列表）。'
    if (status === 422) return 'GitHub 拒绝了请求（422）：' + message
    return message || 'GitHub 操作失败'
}

/** True when a browser fetch was blocked by CORS or otherwise failed at the network layer. */
export function isNetworkOrCorsError(error: any): boolean {
    const message = String(error?.message || '')
    if (/Failed to fetch|NetworkError|Load failed|Network request failed|ERR_/i.test(message)) return true
    return error?.name === 'TypeError' && /fetch/i.test(message)
}

/**
 * Asset uploads hit https://uploads.github.com, which (unlike api.github.com)
 * sends no CORS headers, so a browser cannot upload release assets directly.
 * Explain the real cause and the available workarounds.
 */
export function describeAssetUploadError(error: any, tagName?: string): string {
    if (isNetworkOrCorsError(error)) {
        const command = 'gh release upload ' + (tagName || '<tag>') + ' <文件>'
        return '上传失败：GitHub 的 uploads.github.com 不返回 CORS 头，浏览器无法直接上传 release 资产（api.github.com 支持 CORS，所以读写 release 正常）。'
            + '可改用以下任一方式：① 桌面端 Kotion Desktop（经由本机主进程上传，无 CORS 限制）；'
            + '② 在 GitHub release 页面直接拖拽文件；③ 命令行执行：' + command
    }
    return describeGitHubError(error)
}

/** True when the failure is a token-permission problem (as opposed to a real error). */
export function isPermissionError(error: any): boolean {
    const status = error?.status
    const message = String(error?.message || '')
    return /Resource not accessible|not accessible by/i.test(message)
        || (status === 403 && /forbidden|permission/i.test(message))
}
