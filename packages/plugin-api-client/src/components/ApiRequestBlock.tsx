import React, { useState } from 'react'
import { NodeViewWrapper, type NodeViewProps } from '@kn/editor'
import { useDesktop } from '@kn/common'
import { HTTP_METHODS, formatBytes, parseHeaderLines } from '../types'

const statusClass = (status: number): string => {
    if (status >= 200 && status < 300) return 'text-emerald-600 dark:text-emerald-400'
    if (status >= 300 && status < 400) return 'text-amber-600 dark:text-amber-400'
    return 'text-red-600 dark:text-red-400'
}

/**
 * NodeView for the embedded API request block. Request config is written back
 * to node attributes on every edit, so it persists with the document.
 */
export const ApiRequestBlock: React.FC<NodeViewProps> = (props) => {
    const desktop = useDesktop()
    const attrs = props.node.attrs as Record<string, any>
    const [sending, setSending] = useState(false)
    const [expanded, setExpanded] = useState(false)

    const update = (patch: Record<string, unknown>) => props.updateAttributes(patch)

    const send = async () => {
        if (!desktop) return
        if (!attrs.url) {
            update({ error: '请先填写请求 URL' })
            return
        }
        setSending(true)
        update({ error: '' })
        try {
            const result = await desktop.invoke('http.request', {
                method: attrs.method,
                url: attrs.url,
                headers: parseHeaderLines(attrs.headersText || ''),
                body: attrs.method === 'GET' || attrs.method === 'HEAD' ? undefined : attrs.bodyText,
            })
            const headerLines = Object.keys(result.headers)
                .map((key) => key + ': ' + result.headers[key])
                .join(String.fromCharCode(10))
            update({
                responseStatus: result.status,
                responseStatusText: result.statusText,
                responseDurationMs: result.durationMs,
                responseBodyBytes: result.bodyBytes,
                responseBodyText: result.bodyText,
                responseHeadersText: headerLines,
                responseAt: new Date().toISOString(),
                error: '',
            })
        } catch (err) {
            update({ error: (err as Error).message })
        } finally {
            setSending(false)
        }
    }

    const hasResponse = Boolean(attrs.responseAt) || Boolean(attrs.error)

    return (
        <NodeViewWrapper
            className="api-request-block my-2"
            data-type="api-request"
            contentEditable={false}
        >
            <div className="overflow-hidden rounded-lg border bg-card text-card-foreground shadow-sm">
                <div className="flex items-center gap-2 border-b bg-muted/30 px-2 py-1.5">
                    <select
                        value={attrs.method || 'GET'}
                        onChange={(event) => update({ method: event.target.value })}
                        className="h-7 rounded-md border bg-background px-1.5 text-xs"
                    >
                        {HTTP_METHODS.map((method) => (
                            <option key={method} value={method}>{method}</option>
                        ))}
                    </select>
                    <input
                        value={attrs.url || ''}
                        onChange={(event) => update({ url: event.target.value })}
                        placeholder="https://api.example.com/v1/users"
                        className="h-7 min-w-0 flex-1 rounded-md border bg-background px-2 font-mono text-xs"
                    />
                    <button
                        type="button"
                        disabled={sending || !desktop}
                        onClick={send}
                        className="h-7 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground disabled:opacity-50"
                    >
                        {sending ? '发送中…' : '发送'}
                    </button>
                    <button
                        type="button"
                        onClick={() => setExpanded((value) => !value)}
                        className="h-7 rounded-md px-2 text-xs text-muted-foreground hover:bg-muted"
                    >
                        {expanded ? '收起' : '详情'}
                    </button>
                </div>

                {expanded && (
                    <div className="grid grid-cols-2 gap-2 border-b p-2">
                        <label className="flex flex-col gap-1">
                            <span className="text-[11px] text-muted-foreground">Headers（每行 Key: Value）</span>
                            <textarea
                                value={attrs.headersText || ''}
                                onChange={(event) => update({ headersText: event.target.value })}
                                className="h-24 resize-y rounded-md border bg-background p-2 font-mono text-xs"
                            />
                        </label>
                        <label className="flex flex-col gap-1">
                            <span className="text-[11px] text-muted-foreground">Body</span>
                            <textarea
                                value={attrs.bodyText || ''}
                                onChange={(event) => update({ bodyText: event.target.value })}
                                className="h-24 resize-y rounded-md border bg-background p-2 font-mono text-xs"
                            />
                        </label>
                    </div>
                )}

                {!desktop && (
                    <div className="border-b bg-amber-50 px-3 py-1.5 text-[11px] text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                        该块依赖桌面端能力（主进程 HTTP），Web 端不可用。
                    </div>
                )}

                {hasResponse && (
                    <div>
                        <div className="flex items-center gap-3 border-b px-3 py-1.5 text-xs">
                            {attrs.error
                                ? <span className="text-red-600">{attrs.error}</span>
                                : (
                                    <>
                                        <span className={statusClass(attrs.responseStatus) + ' font-semibold'}>
                                            {attrs.responseStatus} {attrs.responseStatusText}
                                        </span>
                                        <span className="text-muted-foreground">{attrs.responseDurationMs} ms</span>
                                        <span className="text-muted-foreground">
                                            {formatBytes(attrs.responseBodyBytes || 0)}
                                        </span>
                                    </>
                                )}
                        </div>
                        <pre className="max-h-72 overflow-auto px-3 py-2 font-mono text-xs">
                            {attrs.responseBodyText || ''}
                        </pre>
                    </div>
                )}
            </div>
        </NodeViewWrapper>
    )
}
