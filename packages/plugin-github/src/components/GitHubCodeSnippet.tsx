import React, { useState } from 'react'
import { NodeViewWrapper, NodeViewProps } from '@kn/editor'
import { Card, cn } from '@kn/ui'
import { Check, Copy, ExternalLink, FileCode, RefreshCw } from '@kn/icon'
import { GitHubUrlInput } from './shared/GitHubUrlInput'
import {
    GhIconButton,
    GhIconLink,
    ghCard,
    ghCardDashed,
    ghCardInteractive,
    ghChip,
    ghErrorBox,
    ghHeader,
    ghHeaderStart,
    ghIconTile,
    ghRef,
    ghRowHover,
} from './shared/styles'
import { useGitHubData } from '../hooks/use-github-data'
import { getFileContent, decodeContent, extractLines, detectLanguage } from '../services/github-code-service'

export const GitHubCodeSnippet: React.FC<NodeViewProps> = ({ node, updateAttributes, editor, deleteNode }) => {
    const { owner, repo, path, ref, startLine, endLine, content, language, htmlUrl } = node.attrs
    const [copied, setCopied] = useState(false)

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
        if (!content) return
        navigator.clipboard.writeText(content)
        setCopied(true)
        setTimeout(() => setCopied(false), 1600)
    }

    if (!isConfigured) {
        return (
            <NodeViewWrapper>
                <Card className={ghCardDashed}>
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

    const lineLabel = startLine && endLine ? 'L' + startLine + '–' + endLine : startLine ? 'L' + startLine + '+' : ''
    const lineCount = content ? content.split('\n').length : 0

    return (
        <NodeViewWrapper>
            <Card className={cn(ghCard, editor.isEditable && ghCardInteractive)}>
                <div className={ghHeader}>
                    <div className={ghHeaderStart}>
                        <span className={ghIconTile}>
                            <FileCode className="h-3.5 w-3.5" />
                        </span>
                        <div className="flex min-w-0 items-baseline gap-1.5">
                            <span className={ghRef}>
                                {owner}/{repo}/{path}
                            </span>
                            {lineLabel && (
                                <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{lineLabel}</span>
                            )}
                        </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-0.5">
                        {language && <span className={cn(ghChip, 'hidden capitalize sm:inline-flex')}>{language}</span>}
                        {lineCount > 0 && <span className={cn(ghChip, 'hidden lg:inline-flex')}>{lineCount} lines</span>}
                        {loading && <RefreshCw className="h-3.5 w-3.5 animate-spin text-muted-foreground" aria-label="Loading" />}
                        {content && (
                            <GhIconButton label={copied ? 'Copied' : 'Copy code'} onClick={handleCopy}>
                                {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                            </GhIconButton>
                        )}
                        {!loading && editor.isEditable && (
                            <GhIconButton label="Refresh" onClick={refresh}>
                                <RefreshCw className="h-3.5 w-3.5" />
                            </GhIconButton>
                        )}
                        {htmlUrl && (
                            <GhIconLink label="Open on GitHub" href={htmlUrl}>
                                <ExternalLink className="h-3.5 w-3.5" />
                            </GhIconLink>
                        )}
                    </div>
                </div>

                <div className="overflow-x-auto bg-muted/20">
                    {content ? (
                        <pre className="m-0 p-3 text-xs leading-relaxed">
                            <code className="font-mono">
                                {content.split('\n').map((line: string, i: number) => (
                                    <div key={i} className={cn('flex rounded-sm px-1', ghRowHover)}>
                                        <span className="mr-3 min-w-[2.5rem] select-none text-right text-muted-foreground/50">
                                            {(startLine || 1) + i}
                                        </span>
                                        <span className="whitespace-pre">{line || ' '}</span>
                                    </div>
                                ))}
                            </code>
                        </pre>
                    ) : loading ? (
                        <div className="space-y-2 p-3">
                            {[0, 1, 2, 3].map((i) => (
                                <div key={i} className="h-3 rounded bg-muted" style={{ width: 55 + i * 12 + '%' }} />
                            ))}
                        </div>
                    ) : (
                        <div className="px-3 py-6 text-center text-xs text-muted-foreground">No code loaded</div>
                    )}
                </div>

                {error && <div className={ghErrorBox}>{error}</div>}
            </Card>
        </NodeViewWrapper>
    )
}
