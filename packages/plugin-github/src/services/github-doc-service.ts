import {
    compareCommits,
    getFileContent,
    getReadme,
    getRepo,
    getRepoCommits,
    getRepoLanguages,
    getRepoTree,
} from './github-repo-service'
import type { GitHubCommit, GitHubTreeItem } from '../types/github'

const BACKTICK = String.fromCharCode(96)
const FENCE = BACKTICK.repeat(3)

const COMMIT_TYPE_ORDER = [
    'feat', 'fix', 'perf', 'refactor', 'docs', 'test',
    'build', 'ci', 'chore', 'revert', 'style', 'other',
]

const COMMIT_TYPE_LABELS: Record<string, string> = {
    feat: 'Features',
    fix: 'Bug Fixes',
    perf: 'Performance',
    refactor: 'Refactoring',
    docs: 'Documentation',
    test: 'Tests',
    build: 'Build',
    ci: 'Continuous Integration',
    chore: 'Chores',
    revert: 'Reverts',
    style: 'Styles',
    other: 'Other Changes',
}

export interface ParsedCommit {
    type: string
    scope?: string
    subject: string
    breaking: boolean
    prNumber?: number
    hash: string
    shortHash: string
    url: string
    author: string
    date: string
    message: string
}

function extractPrNumber(text: string): number | undefined {
    const hashIndex = text.lastIndexOf('#')
    if (hashIndex === -1) return undefined
    const tail = text.slice(hashIndex + 1)
    let digits = ''
    for (const ch of tail) {
        if (ch >= '0' && ch <= '9') digits += ch
        else break
    }
    if (!digits) return undefined
    const value = parseInt(digits, 10)
    return Number.isFinite(value) ? value : undefined
}

/** Parse a conventional-commit message into structured changelog metadata. */
export function parseCommit(commit: GitHubCommit): ParsedCommit {
    const message = commit.message || ''
    const firstLine = message.split('\n')[0].trim()
    const parsed: ParsedCommit = {
        type: 'other',
        subject: firstLine,
        breaking: message.includes('BREAKING CHANGE') || message.includes('BREAKING-CHANGE'),
        prNumber: extractPrNumber(firstLine),
        hash: commit.sha,
        shortHash: (commit.sha || '').slice(0, 7),
        url: commit.html_url,
        author: commit.author?.name || 'Unknown',
        date: commit.author?.date || '',
        message,
    }

    const colonIndex = firstLine.indexOf(':')
    if (colonIndex > 0 && colonIndex <= 40) {
        const prefix = firstLine.slice(0, colonIndex)
        const body = firstLine.slice(colonIndex + 1).trim()
        const bang = prefix.endsWith('!')
        const cleanPrefix = bang ? prefix.slice(0, -1) : prefix
        const parenIndex = cleanPrefix.indexOf('(')
        let candidateType = cleanPrefix
        let scope: string | undefined
        if (parenIndex > 0 && cleanPrefix.endsWith(')')) {
            candidateType = cleanPrefix.slice(0, parenIndex)
            scope = cleanPrefix.slice(parenIndex + 1, -1)
        }
        if (COMMIT_TYPE_ORDER.indexOf(candidateType) !== -1) {
            parsed.type = candidateType
            parsed.subject = body || firstLine
            if (scope) parsed.scope = scope
            if (bang) parsed.breaking = true
        }
    }

    // Avoid rendering "(#12)" twice: strip the trailing PR reference from the
    // subject since it is re-added as an explicit PR link.
    if (parsed.prNumber) {
        const suffix = '(#' + parsed.prNumber + ')'
        if (parsed.subject.endsWith(suffix)) {
            parsed.subject = parsed.subject.slice(0, -suffix.length).trim()
        }
    }

    return parsed
}

function formatDate(date?: string): string {
    if (!date) return ''
    const value = new Date(date)
    if (Number.isNaN(value.getTime())) return ''
    return value.toISOString().slice(0, 10)
}

function formatCommitEntry(commit: ParsedCommit, owner: string, repo: string): string {
    let line = '- '
    if (commit.scope) line += '**' + commit.scope + '**: '
    line += commit.subject
    line += ' ([' + commit.shortHash + '](' + commit.url + '))'
    if (commit.prNumber) {
        line += ' ([#' + commit.prNumber + '](https://github.com/' + owner + '/' + repo + '/pull/' + commit.prNumber + '))'
    }
    return line
}

export interface ChangelogOptions {
    base?: string
    head?: string
    since?: string
    until?: string
    version?: string
    groupBy?: 'type' | 'none'
    includeAuthors?: boolean
    maxCommits?: number
}

export interface ChangelogResult {
    markdown: string
    commitCount: number
    range: string
    source: 'compare' | 'date-range' | 'recent'
    compareUrl?: string
}

/** Build a Markdown changelog from a list of commits. Pure function (no network). */
export function generateChangelogMarkdown(
    owner: string,
    repo: string,
    commits: GitHubCommit[],
    options: ChangelogOptions = {},
    extra?: { compareUrl?: string; range?: string },
): string {
    const parsed = commits.map(parseCommit)
    const lines: string[] = []
    const title = options.version || options.head || 'Unreleased'
    const latestCommitDate = parsed
        .map(commit => commit.date)
        .filter(Boolean)
        .sort()
        .pop()
    const dateRange = formatDate(options.until) || formatDate(latestCommitDate) || formatDate(new Date().toISOString())

    lines.push('## ' + title + (dateRange ? ' (' + dateRange + ')' : ''))
    lines.push('')

    if (extra?.range) {
        lines.push('> Range: ' + BACKTICK + extra.range + BACKTICK + (extra.compareUrl ? ' - [compare](' + extra.compareUrl + ')' : ''))
        lines.push('')
    } else if (extra?.compareUrl) {
        lines.push('> [View comparison](' + extra.compareUrl + ')')
        lines.push('')
    }

    if (parsed.length === 0) {
        lines.push('_No commits found for this range._')
        return lines.join('\n')
    }

    const breaking = parsed.filter(c => c.breaking)
    const groups = new Map<string, ParsedCommit[]>()
    for (const commit of parsed) {
        const bucket = groups.get(commit.type) || []
        bucket.push(commit)
        groups.set(commit.type, bucket)
    }

    if (breaking.length > 0) {
        lines.push('### Breaking Changes')
        lines.push('')
        for (const commit of breaking) lines.push(formatCommitEntry(commit, owner, repo))
        lines.push('')
    }

    if (options.groupBy === 'none') {
        lines.push('### Changes')
        lines.push('')
        for (const commit of parsed) lines.push(formatCommitEntry(commit, owner, repo))
        lines.push('')
    } else {
        for (const type of COMMIT_TYPE_ORDER) {
            const bucket = groups.get(type)
            if (!bucket || bucket.length === 0) continue
            lines.push('### ' + (COMMIT_TYPE_LABELS[type] || type))
            lines.push('')
            for (const commit of bucket) lines.push(formatCommitEntry(commit, owner, repo))
            lines.push('')
        }
    }

    if (options.includeAuthors) {
        const authors = Array.from(new Set(parsed.map(c => c.author).filter(Boolean))).sort()
        if (authors.length > 0) {
            lines.push('### Contributors')
            lines.push('')
            for (const author of authors) lines.push('- ' + author)
            lines.push('')
        }
    }

    return lines.join('\n').replace(/\n+$/, '') + '\n'
}

/** Fetch commits for a range and render a Markdown changelog. */
export async function generateChangelog(
    token: string,
    owner: string,
    repo: string,
    options: ChangelogOptions = {},
): Promise<ChangelogResult> {
    const maxCommits = Math.min(Math.max(options.maxCommits || 50, 1), 100)
    let commits: GitHubCommit[] = []
    let source: ChangelogResult['source'] = 'recent'
    let compareUrl: string | undefined
    let range: string

    if (options.base && options.head) {
        const comparison = await compareCommits(token, owner, repo, options.base, options.head)
        commits = comparison.commits
        compareUrl = comparison.html_url
        source = 'compare'
        range = options.base + '...' + options.head
    } else {
        commits = await getRepoCommits(token, owner, repo, {
            sha: options.head,
            since: options.since,
            until: options.until,
            per_page: maxCommits,
        })
        source = options.since || options.until ? 'date-range' : 'recent'
        range = options.since || options.until
            ? (options.since || 'beginning') + '..' + (options.until || 'now')
            : 'latest ' + maxCommits + ' commits'
    }

    const markdown = generateChangelogMarkdown(owner, repo, commits, options, { compareUrl, range })
    return { markdown, commitCount: commits.length, range, source, compareUrl }
}

interface TreeNode {
    name: string
    type: 'dir' | 'file'
    children: TreeNode[]
    childMap: Map<string, TreeNode>
}

/** Render a flat GitHub tree as an ASCII directory tree. */
export function buildAsciiTree(
    items: GitHubTreeItem[],
    options?: { maxDepth?: number; maxEntries?: number },
): string {
    const maxDepth = options?.maxDepth || 3
    const maxEntries = options?.maxEntries || 300
    const root: TreeNode = { name: '', type: 'dir', children: [], childMap: new Map() }

    for (const item of items) {
        const segments = item.path.split('/').filter(Boolean)
        if (segments.length === 0 || segments.length > maxDepth) continue
        let current = root
        for (let i = 0; i < segments.length; i += 1) {
            const name = segments[i]
            const isLeaf = i === segments.length - 1
            let next = current.childMap.get(name)
            if (!next) {
                next = {
                    name,
                    type: isLeaf && item.type !== 'dir' ? 'file' : 'dir',
                    children: [],
                    childMap: new Map(),
                }
                current.childMap.set(name, next)
                current.children.push(next)
            }
            current = next
        }
    }

    const lines: string[] = []
    let count = 0

    const walk = (node: TreeNode, prefix: string, isLast: boolean, depth: number) => {
        if (depth > 0) {
            if (count >= maxEntries) return
            count += 1
            const connector = isLast ? '└── ' : '├── '
            lines.push(prefix + connector + node.name + (node.type === 'dir' ? '/' : ''))
        }
        const childPrefix = depth === 0 ? '' : prefix + (isLast ? '    ' : '│   ')
        node.children.sort((a, b) => {
            if (a.type === 'dir' && b.type !== 'dir') return -1
            if (a.type !== 'dir' && b.type === 'dir') return 1
            return a.name.localeCompare(b.name)
        })
        node.children.forEach((child, index) => {
            walk(child, childPrefix, index === node.children.length - 1, depth + 1)
        })
    }

    walk(root, '', true, 0)
    return lines.join('\n')
}

interface PackageManifest {
    name?: string
    version?: string
    packageManager?: string
    scripts?: Record<string, string>
    dependencies?: Record<string, string>
    devDependencies?: Record<string, string>
}

async function loadPackageManifest(
    token: string,
    owner: string,
    repo: string,
    ref?: string,
): Promise<PackageManifest | null> {
    try {
        const file = await getFileContent(token, owner, repo, 'package.json', ref)
        return JSON.parse(file.content) as PackageManifest
    } catch {
        return null
    }
}

const README_KEYWORDS = ['getting started', 'installation', 'install', 'quick start', 'quickstart', 'usage', 'setup']

function extractReadmeSection(readme: string): string {
    const lines = readme.split('\n')
    let start = -1
    let level = 0

    for (let i = 0; i < lines.length; i += 1) {
        const line = lines[i]
        if (!line.startsWith('#')) continue
        let lvl = 0
        while (lvl < line.length && line[lvl] === '#') lvl += 1
        const text = line.slice(lvl).trim().toLowerCase()
        if (README_KEYWORDS.some(keyword => text.includes(keyword))) {
            start = i
            level = lvl
            break
        }
    }

    if (start === -1) return ''

    const collected: string[] = []
    for (let i = start + 1; i < lines.length; i += 1) {
        const line = lines[i]
        if (line.startsWith('#')) {
            let lvl = 0
            while (lvl < line.length && line[lvl] === '#') lvl += 1
            if (lvl <= level) break
        }
        collected.push(line)
        if (collected.length >= 40) break
    }

    const text = collected.join('\n').trim()
    if (!text) return ''
    return text.length > 2000 ? text.slice(0, 2000) + '\n...' : text
}

export interface ProjectDocOptions {
    ref?: string
    includeTree?: boolean
    treeDepth?: number
    includeReadme?: boolean
    maxTreeEntries?: number
}

export interface ProjectDocResult {
    markdown: string
    sections: string[]
    treeTruncated: boolean
}

/** Build a Markdown project overview from repository metadata, tree, manifest and README. */
export async function generateProjectDoc(
    token: string,
    owner: string,
    repo: string,
    options: ProjectDocOptions = {},
): Promise<ProjectDocResult> {
    const [repoData, languages] = await Promise.all([
        getRepo(token, owner, repo),
        getRepoLanguages(token, owner, repo).catch((): Record<string, number> => ({})),
    ])

    const sections: string[] = ['Overview']
    const lines: string[] = []

    lines.push('# ' + repoData.name)
    lines.push('')
    if (repoData.description) {
        lines.push(repoData.description)
        lines.push('')
    }

    lines.push('## Overview')
    lines.push('')
    lines.push('| Property | Value |')
    lines.push('| --- | --- |')
    lines.push('| Repository | [' + repoData.full_name + '](' + repoData.html_url + ') |')
    lines.push('| Visibility | ' + (repoData.visibility || 'public') + ' |')
    lines.push('| Default branch | ' + BACKTICK + repoData.default_branch + BACKTICK + ' |')
    if (repoData.language) lines.push('| Primary language | ' + repoData.language + ' |')
    lines.push('| Stars | ' + repoData.stargazers_count + ' |')
    lines.push('| Forks | ' + repoData.forks_count + ' |')
    lines.push('| Open issues | ' + repoData.open_issues_count + ' |')
    lines.push('')

    const languageEntries = Object.keys(languages).map(name => ({ name, bytes: languages[name] }))
    if (languageEntries.length > 0) {
        const total = languageEntries.reduce((sum, entry) => sum + entry.bytes, 0) || 1
        languageEntries.sort((a, b) => b.bytes - a.bytes)
        lines.push('## Tech Stack')
        lines.push('')
        for (const entry of languageEntries.slice(0, 8)) {
            lines.push('- ' + entry.name + ': ' + ((entry.bytes / total) * 100).toFixed(1) + '%')
        }
        lines.push('')
        sections.push('Tech Stack')
    }

    let treeTruncated = false
    if (options.includeTree !== false) {
        const treeResult = await getRepoTree(token, owner, repo, {
            ref: options.ref,
            recursive: true,
            depth: options.treeDepth || 2,
        })
        treeTruncated = treeResult.truncated
        const ascii = buildAsciiTree(treeResult.items, {
            maxDepth: options.treeDepth || 2,
            maxEntries: options.maxTreeEntries || 300,
        })
        if (ascii) {
            lines.push('## Project Structure')
            lines.push('')
            lines.push(FENCE)
            lines.push(ascii)
            lines.push(FENCE)
            lines.push('')
            if (treeTruncated) {
                lines.push('> Note: GitHub marked this tree as truncated; some entries are missing.')
                lines.push('')
            }
            sections.push('Project Structure')
        }
    }

    const manifest = await loadPackageManifest(token, owner, repo, options.ref)
    if (manifest) {
        const scripts = manifest.scripts || {}
        const scriptNames = Object.keys(scripts)
        if (scriptNames.length > 0) {
            lines.push('## Available Scripts')
            lines.push('')
            lines.push('| Script | Command |')
            lines.push('| --- | --- |')
            for (const name of scriptNames.slice(0, 25)) {
                lines.push('| ' + BACKTICK + name + BACKTICK + ' | ' + BACKTICK + scripts[name] + BACKTICK + ' |')
            }
            lines.push('')
            sections.push('Available Scripts')
        }

        const dependencies = Object.keys(manifest.dependencies || {})
        const devDependencies = Object.keys(manifest.devDependencies || {})
        if (dependencies.length > 0 || devDependencies.length > 0) {
            lines.push('## Key Dependencies')
            lines.push('')
            if (dependencies.length > 0) {
                lines.push('- Runtime: ' + dependencies.slice(0, 30).join(', '))
            }
            if (devDependencies.length > 0) {
                lines.push('- Development: ' + devDependencies.slice(0, 30).join(', '))
            }
            lines.push('')
            sections.push('Key Dependencies')
        }
    }

    if (options.includeReadme !== false) {
        const readme = await getReadme(token, owner, repo, options.ref).catch(() => null)
        const excerpt = readme ? extractReadmeSection(readme) : ''
        if (excerpt) {
            lines.push('## Getting Started')
            lines.push('')
            lines.push(excerpt)
            lines.push('')
            sections.push('Getting Started')
        }
    }

    lines.push('## Links')
    lines.push('')
    lines.push('- Repository: ' + repoData.html_url)
    if (repoData.visibility === 'public') {
        lines.push('- Issues: ' + repoData.html_url + '/issues')
        lines.push('- Releases: ' + repoData.html_url + '/releases')
    }
    lines.push('')

    return { markdown: lines.join('\n'), sections, treeTruncated }
}
