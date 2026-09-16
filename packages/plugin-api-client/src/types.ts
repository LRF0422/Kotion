export const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']

export const parseHeaderLines = (text: string): Record<string, string> => {
    const headers: Record<string, string> = {}
    text.split(String.fromCharCode(10)).forEach((line) => {
        const trimmed = line.trim()
        if (!trimmed) return
        const index = trimmed.indexOf(':')
        if (index <= 0) return
        const key = trimmed.slice(0, index).trim()
        const value = trimmed.slice(index + 1).trim()
        if (key) headers[key] = value
    })
    return headers
}

export const formatBytes = (bytes: number): string =>
    bytes < 1024 ? bytes + ' B' : (bytes / 1024).toFixed(1) + ' KB'
