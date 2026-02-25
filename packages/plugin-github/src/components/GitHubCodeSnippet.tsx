import React from 'react'
import { NodeViewWrapper, NodeViewProps } from '@kn/editor'
import { Card, cn } from '@kn/ui'
import { RefreshCw, ExternalLink, Copy, FileCode } from '@kn/icon'
import { GitHubUrlInput } from './shared/GitHubUrlInput'
import { useGitHubData } from '../hooks/use-github-data'
import { getFileContent, decodeContent, extractLines, detectLanguage } from '../services/github-code-service'

export const GitHubCodeSnippet: React.FC<NodeViewProps> = ({ node, updateAttributes, editor, deleteNode }) => {
    const { owner, repo, path, ref, startLine, endLine, content, language, htmlUrl } = node.attrs

    const isConfigured = owner && repo && path

    const { loading, error, refresh } = useGitHubData({
        fetcher: async (token) => {
            const file = await getFileContent(token, owner, repo, path, ref || undefined)
            const decoded = decodeContent(file.content, file.encoding)
            const extracted = extractLines(decoded, startLine || undefined, endLine || undefined)
            const lang = detectLanguage(path)
            updateAttributes({
                content: extracted,
                language: lang,
                htmlUrl: file.html_url,
                lastSyncAt: new Date().toISOString(),
            })
            return extracted
        },
        enabled: !!isConfigured,
    })

    const handleCopy = () => {
        if (content) {
            navigator.clipboard.writeText(content)
        }
    }

    if (!isConfigured) {
        return (
            <NodeViewWrapper>
                <Card className="my-4 border-2 border-dashed">
                    <GitHubUrlInput
                        type="code"
                        onSubmit={(parsed) => {
                            updateAttributes({
                                owner: parsed.owner,
                                repo: parsed.repo,
                                path: parsed.path || '',
                                ref: parsed.ref || '',
                                startLine: parsed.startLine || 0,
                                endLine: parsed.endLine || 0,
                            })
                        }}
                        onCancel={deleteNode}
                    />
                </Card>
            </NodeViewWrapper>
        )
    }

    const lineLabel = startLine && endLine ? `L${startLine}-${endLine}` : startLine ? `L${startLine}+` : ''

    return (
        <NodeViewWrapper>
            <Card className={cn(
                'my-4 overflow-hidden transition-all duration-200 border',
                editor.isEditable && 'hover:border-primary/50'
            )}>
                {/* Header */}
                <div className="flex items-center justify-between px-3 py-1.5 bg-muted/50 border-b text-xs text-muted-foreground">
                    <div className="flex items-center gap-1.5 min-w-0">
                        <FileCode className="h-3.5 w-3.5 flex-shrink-0" />
                        <span className="truncate font-mono">{owner}/{repo}/{path}</span>
                        {lineLabel && <span className="text-muted-foreground/70">({lineLabel})</span>}
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                        {content && (
                            <button onClick={handleCopy} className="p-0.5 hover:bg-muted rounded" title="Copy code">
                                <Copy className="h-3 w-3" />
                            </button>
                        )}
                        {loading && <RefreshCw className="h-3 w-3 animate-spin" />}
                        {!loading && editor.isEditable && (
                            <button onClick={refresh} className="p-0.5 hover:bg-muted rounded" title="Refresh">
                                <RefreshCw className="h-3 w-3" />
                            </button>
                        )}
                        {htmlUrl && (
                            <a href={htmlUrl} target="_blank" rel="noopener noreferrer" className="p-0.5 hover:bg-muted rounded">
                                <ExternalLink className="h-3 w-3" />
                            </a>
                        )}
                    </div>
                </div>

                {/* Code body */}
                <div className="overflow-x-auto">
                    {content ? (
                        <pre className="p-3 text-xs font-mono leading-relaxed m-0">
                            <code>
                                {content.split('\n').map((line: string, i: number) => (
                                    <div key={i} className="flex">
                                        <span className="select-none text-muted-foreground/50 pr-4 text-right min-w-[2.5rem]">
                                            {(startLine || 1) + i}
                                        </span>
                                        <span>{line}</span>
                                    </div>
                                ))}
                            </code>
                        </pre>
                    ) : loading ? (
                        <div className="p-4 text-xs text-muted-foreground text-center">Loading code...</div>
                    ) : null}
                </div>

                {error && <div className="px-3 pb-2 text-xs text-red-500">{error}</div>}
            </Card>
        </NodeViewWrapper>
    )
}
