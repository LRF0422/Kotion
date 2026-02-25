import React, { useState } from 'react'
import { Input, Button } from '@kn/ui'

interface ParsedGitHubUrl {
    owner: string
    repo: string
    type: 'issue' | 'pr' | 'repo' | 'code'
    number?: number
    path?: string
    ref?: string
    startLine?: number
    endLine?: number
}

export function parseGitHubUrl(input: string): ParsedGitHubUrl | null {
    const trimmed = input.trim()

    // Match owner/repo#number (shorthand for issue/PR)
    const shortMatch = trimmed.match(/^([^/\s]+)\/([^#\s]+)#(\d+)$/)
    if (shortMatch) {
        return { owner: shortMatch[1], repo: shortMatch[2], type: 'issue', number: parseInt(shortMatch[3]) }
    }

    // Match owner/repo (shorthand for repo)
    const repoShortMatch = trimmed.match(/^([^/\s]+)\/([^/\s#]+)$/)
    if (repoShortMatch) {
        return { owner: repoShortMatch[1], repo: repoShortMatch[2], type: 'repo' }
    }

    // Match full GitHub URLs
    const urlMatch = trimmed.match(/github\.com\/([^/]+)\/([^/]+)(?:\/(.*))?/)
    if (!urlMatch) return null

    const owner = urlMatch[1]
    const repo = urlMatch[2].replace(/\.git$/, '')
    const rest = urlMatch[3] || ''

    // Issue URL: /issues/123
    const issueMatch = rest.match(/^issues\/(\d+)/)
    if (issueMatch) {
        return { owner, repo, type: 'issue', number: parseInt(issueMatch[1]) }
    }

    // PR URL: /pull/123
    const prMatch = rest.match(/^pull\/(\d+)/)
    if (prMatch) {
        return { owner, repo, type: 'pr', number: parseInt(prMatch[1]) }
    }

    // Code URL: /blob/main/src/index.ts#L10-L25
    const codeMatch = rest.match(/^blob\/([^/]+)\/(.+?)(?:#L(\d+)(?:-L(\d+))?)?$/)
    if (codeMatch) {
        return {
            owner, repo, type: 'code',
            ref: codeMatch[1],
            path: codeMatch[2],
            startLine: codeMatch[3] ? parseInt(codeMatch[3]) : undefined,
            endLine: codeMatch[4] ? parseInt(codeMatch[4]) : undefined,
        }
    }

    // Repo URL (no path)
    if (!rest || rest === '') {
        return { owner, repo, type: 'repo' }
    }

    return { owner, repo, type: 'repo' }
}

interface GitHubUrlInputProps {
    type: 'issue' | 'pr' | 'repo' | 'code'
    placeholder?: string
    onSubmit: (parsed: ParsedGitHubUrl) => void
    onCancel?: () => void
}

export const GitHubUrlInput: React.FC<GitHubUrlInputProps> = ({ type, placeholder, onSubmit, onCancel }) => {
    const [url, setUrl] = useState('')
    const [error, setError] = useState('')

    const defaultPlaceholders: Record<string, string> = {
        issue: 'owner/repo#123 or https://github.com/owner/repo/issues/123',
        pr: 'owner/repo#123 or https://github.com/owner/repo/pull/123',
        repo: 'owner/repo or https://github.com/owner/repo',
        code: 'https://github.com/owner/repo/blob/main/src/index.ts#L10-L25',
    }

    const handleSubmit = () => {
        const parsed = parseGitHubUrl(url)
        if (!parsed) {
            setError('Invalid GitHub URL or shorthand format')
            return
        }
        // For shorthand owner/repo#number, need to detect if it's issue or PR
        // Default to the expected type, user can correct via the card
        if (type === 'pr' && parsed.type === 'issue') {
            parsed.type = 'pr'
        }
        setError('')
        onSubmit(parsed)
    }

    return (
        <div className="p-4 flex flex-col items-center gap-3">
            <div className="text-sm text-muted-foreground">
                Paste a GitHub {type === 'pr' ? 'Pull Request' : type === 'issue' ? 'Issue' : type === 'repo' ? 'Repository' : 'Code'} URL
            </div>
            <div className="w-full max-w-md space-y-2">
                <Input
                    value={url}
                    onChange={(e) => { setUrl(e.target.value); setError('') }}
                    placeholder={placeholder || defaultPlaceholders[type]}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit() }}
                />
                {error && <p className="text-xs text-red-500">{error}</p>}
                <div className="flex gap-2">
                    <Button size="sm" onClick={handleSubmit} disabled={!url.trim()}>Embed</Button>
                    {onCancel && <Button size="sm" variant="outline" onClick={onCancel}>Cancel</Button>}
                </div>
            </div>
        </div>
    )
}
