/**
 * Plugin Studio — files-tab syntax colouring.
 *
 * The Files tab is a read-only source reader: without colour, strings, comments
 * and keywords blur into one grey wall. A full highlighter (highlight.js,
 * shiki, CodeMirror language packs) would add hundreds of KB to this plugin's
 * UMD bundle for a panel that shows ~2k lines, so this module is a small
 * dependency-free tokenizer covering the languages a plugin project actually
 * contains — TS/TSX, JSON, CSS, HTML/SVG, Markdown, YAML, shell, Python.
 * Anything else stays one `plain` run.
 *
 * Tokens carry a semantic `kind`, never a colour: the viewer maps kinds onto the
 * active light/dark palette (`./CodeView`), so theming stays a rendering
 * concern and this file stays testable in plain Node.
 */

export type TokenKind =
    | 'plain'
    | 'comment'
    | 'string'
    | 'number'
    | 'keyword'
    | 'literal'
    | 'function'
    | 'type'
    | 'property'
    | 'tag'
    | 'attr'
    | 'heading'
    | 'link'
    | 'variable'
    | 'punct'

export interface Token {
    text: string
    kind: TokenKind
}

/** One rendered source line; the viewer draws a line at a time. */
export type LineTokens = Token[]

/**
 * Tokenizer families — one scanner per *syntax shape*, not per extension:
 * `.ts/.tsx/.js/.mjs` all share `ts`, `.scss/.less` share `css`, and so on.
 */
export type FileLanguage =
    | 'ts'
    | 'json'
    | 'css'
    | 'markup'
    | 'markdown'
    | 'yaml'
    | 'shell'
    | 'python'
    | 'text'

const BY_EXTENSION: Record<string, FileLanguage> = {
    ts: 'ts',
    tsx: 'ts',
    mts: 'ts',
    cts: 'ts',
    js: 'ts',
    jsx: 'ts',
    mjs: 'ts',
    cjs: 'ts',
    json: 'json',
    jsonc: 'json',
    css: 'css',
    scss: 'css',
    less: 'css',
    html: 'markup',
    htm: 'markup',
    xml: 'markup',
    svg: 'markup',
    vue: 'markup',
    md: 'markdown',
    mdx: 'markdown',
    markdown: 'markdown',
    yml: 'yaml',
    yaml: 'yaml',
    sh: 'shell',
    bash: 'shell',
    zsh: 'shell',
    fish: 'shell',
    py: 'python',
}

/** Extensionless project files that still read as source. */
const BY_NAME: Record<string, FileLanguage> = {
    dockerfile: 'shell',
    makefile: 'shell',
}

/** Which scanner handles a project-relative path. Unknown extensions are text. */
export const languageOf = (path: string): FileLanguage => {
    const name = (path.split(/[\\/]/).pop() ?? '').toLowerCase()
    const byName = BY_NAME[name]
    if (byName) return byName
    const dot = name.lastIndexOf('.')
    if (dot <= 0) return 'text'
    return BY_EXTENSION[name.slice(dot + 1)] ?? 'text'
}

/** Tokenize `text` into per-line runs, keeping every line the file has. */
export const highlight = (text: string, language: FileLanguage): LineTokens[] => {
    const normalised = text.replace(/\r\n?/g, '\n')
    switch (language) {
        case 'markdown':
            return highlightMarkdown(normalised)
        case 'markup':
            return toLines(scanMarkup(normalised))
        case 'text':
            return toLines([{ text: normalised, kind: 'plain' }])
        default:
            return toLines(scanCode(normalised, SYNTAX[language]))
    }
}

/**
 * Split a flat token stream into lines. Multi-line tokens (block comments,
 * template literals, tag bodies) are cut at each newline so a line keeps a
 * single flex row — the token kind carries across the cut.
 */
const toLines = (tokens: Token[]): LineTokens[] => {
    const lines: LineTokens[] = [[]]
    for (const token of tokens) {
        token.text.split('\n').forEach((part, index) => {
            if (index > 0) lines.push([])
            if (part) lines[lines.length - 1].push({ text: part, kind: token.kind })
        })
    }
    return lines
}

const isDigit = (char: string) => char >= '0' && char <= '9'
const isIdentStart = (char: string) => /[A-Za-z_$]/.test(char)
const isIdent = (char: string) => /[A-Za-z0-9_$]/.test(char)
const isSpace = (char: string) => /\s/.test(char)

/** `'a b c'` → `{ a: kind, b: kind, c: kind }`; keeps the word tables readable. */
const wordKinds = (kind: TokenKind, words: string): Record<string, TokenKind> => {
    const table: Record<string, TokenKind> = {}
    for (const word of words.split(' ')) if (word) table[word] = kind
    return table
}

const TS_WORDS: Record<string, TokenKind> = {
    ...wordKinds('keyword', 'import export from as default const let var function class extends implements interface type enum namespace declare module return if else for while do switch case break continue try catch finally throw new delete typeof instanceof in of await async yield get set static readonly public private protected abstract override satisfies keyof infer is asserts void'),
    ...wordKinds('literal', 'true false null undefined this super NaN Infinity'),
    ...wordKinds('type', 'string number boolean object symbol bigint any unknown never'),
}

const PYTHON_WORDS: Record<string, TokenKind> = {
    ...wordKinds('keyword', 'def class return if elif else for while in not and or import from as pass break continue with try except finally raise lambda global nonlocal assert del async await yield match case'),
    ...wordKinds('literal', 'True False None self cls'),
}

const SHELL_WORDS: Record<string, TokenKind> = {
    ...wordKinds('keyword', 'if then else elif fi for while until do done case esac function export local readonly return source unset shift trap in'),
    ...wordKinds('function', 'echo cd pwd ls cat grep sed awk curl wget pnpm npm npx node git mkdir rm cp mv chmod'),
}

const JSON_WORDS: Record<string, TokenKind> = wordKinds('literal', 'true false null')
const YAML_WORDS: Record<string, TokenKind> = wordKinds('literal', 'true false null yes no on off')
const CSS_WORDS: Record<string, TokenKind> = wordKinds('literal', 'important inherit initial unset auto none')

/** Per-family scanner configuration; `scanCode` is the single implementation. */
interface Syntax {
    lineComment?: string
    blockComment?: [string, string]
    quotes: string
    template?: boolean
    tripleQuoted?: boolean
    words?: Record<string, TokenKind>
    /** Capitalised identifiers are types (TS reads `ChatMessage` as a type). */
    capitalisedTypes?: boolean
    /** `key:` reads as a property (TS object literals, JSON, YAML, CSS). */
    objectKeys?: boolean
    /** Hyphens join words (`min-width`, `some-key`). */
    dashedWords?: boolean
    /** `--tone` custom properties (CSS). */
    customProperties?: boolean
    /** `<Tag attr="v">` bodies (`.tsx`). */
    jsx?: boolean
    /** `@media` and friends. */
    atRules?: boolean
    /** `#abc` hex colours read as numbers, `#id` selectors as tags. */
    hashColours?: boolean
    /** `$VAR` / `$(…)` expansions. */
    dollarVars?: boolean
}

const SYNTAX: Record<Exclude<FileLanguage, 'markup' | 'markdown' | 'text'>, Syntax> = {
    ts: {
        lineComment: '//',
        blockComment: ['/*', '*/'],
        quotes: "'\"",
        template: true,
        words: TS_WORDS,
        capitalisedTypes: true,
        objectKeys: true,
        jsx: true,
    },
    json: {
        // Committed JSON often carries comments (`jsonc`, tsconfig, scaffolded
        // manifests); colouring them beats showing them as broken code.
        lineComment: '//',
        quotes: '"',
        words: JSON_WORDS,
        objectKeys: true,
    },
    css: {
        blockComment: ['/*', '*/'],
        quotes: "'\"",
        words: CSS_WORDS,
        objectKeys: true,
        dashedWords: true,
        customProperties: true,
        atRules: true,
        hashColours: true,
    },
    yaml: {
        lineComment: '#',
        quotes: "'\"",
        words: YAML_WORDS,
        objectKeys: true,
        dashedWords: true,
    },
    shell: {
        lineComment: '#',
        quotes: "'\"",
        template: true,
        words: SHELL_WORDS,
        dollarVars: true,
    },
    python: {
        lineComment: '#',
        quotes: "'\"",
        tripleQuoted: true,
        words: PYTHON_WORDS,
        capitalisedTypes: true,
    },
}

/** Tokenize one code file. Hand-written state machine; every branch advances. */
const scanCode = (text: string, syntax: Syntax): Token[] => {
    const tokens: Token[] = []
    const push = (kind: TokenKind, value: string) => {
        if (value) tokens.push({ text: value, kind })
    }

    /** Index of the first non-space character at or after `from`. */
    const skipSpace = (from: number): number => {
        let index = from
        while (index < text.length && isSpace(text[index])) index += 1
        return index
    }
    /** Index of the last non-space character before `from` (or -1). */
    const prevIndex = (from: number): number => {
        let index = from - 1
        while (index >= 0 && isSpace(text[index])) index -= 1
        return index
    }

    let index = 0
    /** Inside a JSX open tag every identifier reads as an attribute name. */
    let inTag = false
    /** Word characters, with hyphens joining words in CSS/YAML (`min-width`). */
    const isWordChar = (at: number) =>
        isIdent(text[at]) || (Boolean(syntax.dashedWords) && text[at] === '-' && isIdent(text[at + 1] ?? ''))

    while (index < text.length) {
        const char = text[index]

        if (isSpace(char)) {
            const stop = skipSpace(index)
            push('plain', text.slice(index, stop))
            index = stop
            continue
        }

        if (syntax.lineComment && text.startsWith(syntax.lineComment, index)) {
            let stop = text.indexOf('\n', index)
            if (stop < 0) stop = text.length
            push('comment', text.slice(index, stop))
            index = stop
            continue
        }

        if (syntax.blockComment && text.startsWith(syntax.blockComment[0], index)) {
            const close = text.indexOf(syntax.blockComment[1], index + syntax.blockComment[0].length)
            const stop = close < 0 ? text.length : close + syntax.blockComment[1].length
            push('comment', text.slice(index, stop))
            index = stop
            continue
        }

        const quoted = readQuoted(index, syntax, text)
        if (quoted) {
            // A quoted `"key"` in an object reads as a property, not a value.
            const after = skipSpace(index + quoted.length)
            const isKey =
                Boolean(syntax.objectKeys) &&
                !inTag &&
                text[after] === ':' &&
                text[after + 1] !== ':' &&
                text[prevIndex(index)] !== '?'
            push(isKey ? 'property' : 'string', quoted)
            index += quoted.length
            continue
        }

        if (
            syntax.customProperties &&
            char === '-' &&
            text[index + 1] === '-' &&
            isIdentStart(text[index + 2] ?? '')
        ) {
            let stop = index + 2
            while (stop < text.length && isWordChar(stop)) stop += 1
            push('property', text.slice(index, stop))
            index = stop
            continue
        }

        if (syntax.dollarVars && char === '$') {
            const name = /^\$(?:\{[^}]*\}|[\w@#?$!*]+)/.exec(text.slice(index, index + 120))
            if (name) {
                push('variable', name[0])
                index += name[0].length
                continue
            }
        }

        if (isDigit(char) || (char === '.' && isDigit(text[index + 1] ?? ''))) {
            const number = /^(?:0[xX][\da-fA-F_]+|0[bB][01_]+|0[oO][0-7_]+|\d[\d_]*(?:\.\d[\d_]*)?(?:[eE][+-]?\d+)?|\.\d[\d_]*)/.exec(
                text.slice(index, index + 48),
            )
            const value = number?.[0] ?? char
            push('number', value)
            index += value.length
            continue
        }

        if (syntax.hashColours && char === '#' && /[\w-]/.test(text[index + 1] ?? '')) {
            const value = /^#[0-9a-zA-Z-]*/.exec(text.slice(index, index + 24))?.[0] ?? char
            push(/^#[\da-fA-F]{3,8}$/.test(value) ? 'number' : 'tag', value)
            index += value.length
            continue
        }

        if (syntax.atRules && char === '@' && isIdentStart(text[index + 1] ?? '')) {
            let stop = index + 1
            while (stop < text.length && /[\w-]/.test(text[stop])) stop += 1
            push('keyword', text.slice(index, stop))
            index = stop
            continue
        }

        if (syntax.jsx && !inTag && char === '<' && !isIdent(text[prevIndex(index)] ?? '')) {
            const tag = /^<\/?[A-Za-z][\w.:-]*/.exec(text.slice(index, index + 120))
            if (tag) {
                push('tag', tag[0])
                inTag = !tag[0].startsWith('</')
                index += tag[0].length
                continue
            }
        }

        if (isIdentStart(char)) {
            let stop = index + 1
            while (stop < text.length && isWordChar(stop)) stop += 1
            const word = text.slice(index, stop)
            const next = skipSpace(stop)
            const nextChar = text[next] ?? ''

            let kind: TokenKind = syntax.words?.[word] ?? 'plain'
            if (kind === 'plain') {
                const isKey =
                    Boolean(syntax.objectKeys) &&
                    nextChar === ':' &&
                    text[next + 1] !== ':' &&
                    text[prevIndex(index)] !== '?'
                if (inTag) kind = 'attr'
                else if (isKey) kind = 'property'
                else if (syntax.capitalisedTypes && /^[A-Z]/.test(word)) kind = 'type'
                else if (nextChar === '(') kind = 'function'
            }

            push(kind, word)
            index = stop
            continue
        }

        if (inTag && char === '>') inTag = false
        push('punct', char)
        index += 1
    }

    return tokens
}

/**
 * Consume a quoted literal starting at `from` when one starts there.
 *
 * Single/double quotes stop at a newline (an unterminated string must not eat
 * the rest of the file); template literals and Python's triple quotes may span
 * lines, which is why the caller treats the whole run as one token.
 */
const readQuoted = (from: number, syntax: Syntax, text: string): string => {
    const triple = syntax.tripleQuoted
        ? text.startsWith('"""', from)
            ? '"""'
            : text.startsWith("'''", from)
              ? "'''"
              : ''
        : ''
    if (triple) {
        const close = text.indexOf(triple, from + triple.length)
        return text.slice(from, close < 0 ? text.length : close + triple.length)
    }

    const char = text[from]
    const template = Boolean(syntax.template) && char === '`'
    if (!template && !syntax.quotes.includes(char)) return ''

    let index = from + 1
    while (index < text.length) {
        const current = text[index]
        if (current === '\\') {
            index += 2
            continue
        }
        if (current === char) {
            index += 1
            break
        }
        if (current === '\n' && !template) break
        index += 1
    }
    return text.slice(from, Math.min(index, text.length))
}

/** HTML / XML / SVG: comments, tag names, attribute names and quoted values. */
const scanMarkup = (text: string): Token[] => {
    const tokens: Token[] = []
    const push = (kind: TokenKind, value: string) => {
        if (value) tokens.push({ text: value, kind })
    }
    const startsTag = (index: number) =>
        text[index] === '<' && /[A-Za-z/!?]/.test(text[index + 1] ?? '')
    const readWord = (from: number): number => {
        let stop = from
        while (stop < text.length && /[\w.:-]/.test(text[stop])) stop += 1
        return stop
    }

    let index = 0
    while (index < text.length) {
        if (text.startsWith('<!--', index)) {
            const close = text.indexOf('-->', index + 4)
            const stop = close < 0 ? text.length : close + 3
            push('comment', text.slice(index, stop))
            index = stop
            continue
        }

        if (startsTag(index)) {
            let cursor = index + 1
            const closing = text[cursor] === '/'
            if (closing) cursor += 1
            push('punct', text.slice(index, cursor))

            const nameEnd = readWord(cursor)
            if (nameEnd > cursor) push('tag', text.slice(cursor, nameEnd))
            cursor = nameEnd

            // Attributes run until the tag closes. Pushing the whole run through
            // one loop keeps `>` inside a quoted value from ending the tag.
            while (cursor < text.length && text[cursor] !== '>') {
                const char = text[cursor]
                if (isSpace(char)) {
                    let stop = cursor + 1
                    while (stop < text.length && isSpace(text[stop])) stop += 1
                    push('plain', text.slice(cursor, stop))
                    cursor = stop
                    continue
                }
                if (char === '=' || char === '/') {
                    push('punct', char)
                    cursor += 1
                    continue
                }
                if (char === '"' || char === "'") {
                    const close = text.indexOf(char, cursor + 1)
                    const stop = close < 0 ? text.length : close + 1
                    push('string', text.slice(cursor, stop))
                    cursor = stop
                    continue
                }
                let stop = cursor + 1
                while (stop < text.length && !/[\s=>/]/.test(text[stop])) stop += 1
                push('attr', text.slice(cursor, stop))
                cursor = stop
            }
            if (text[cursor] === '>') {
                push('punct', '>')
                cursor += 1
            }
            index = cursor
            continue
        }

        let stop = index + 1
        while (stop < text.length && !startsTag(stop)) stop += 1
        push('plain', text.slice(index, stop))
        index = stop
    }

    return tokens
}

/**
 * Markdown: fenced blocks stay plain (the fence itself is a comment), headings
 * and lists get their own colour, and inline code/bold/links are picked out.
 */
const highlightMarkdown = (text: string): LineTokens[] => {
    let fence = ''
    return text.split('\n').map((line): LineTokens => {
        const fenceMarker = /^\s*(`{3,}|~{3,})/.exec(line)?.[1] ?? ''
        if (fenceMarker) {
            if (!fence) fence = fenceMarker[0]
            else if (fenceMarker.startsWith(fence)) fence = ''
            return [{ text: line, kind: 'comment' }]
        }
        if (fence) return [{ text: line, kind: 'plain' }]
        return highlightMarkdownLine(line)
    })
}

const highlightMarkdownLine = (line: string): LineTokens => {
    if (!line) return []
    const indent = /^\s*/.exec(line)?.[0] ?? ''
    const body = line.slice(indent.length)
    const lead: Token[] = indent ? [{ text: indent, kind: 'plain' }] : []

    if (/^#{1,6}\s/.test(body)) return [...lead, { text: body, kind: 'heading' }]
    if (/^([-*_])\1{2,}\s*$/.test(body)) return [{ text: line, kind: 'punct' }]

    const quote = /^>\s?/.exec(body)?.[0]
    if (quote) return [...lead, { text: quote, kind: 'punct' }, ...highlightInline(body.slice(quote.length))]

    const bullet = /^([-*+]|\d+[.)])\s/.exec(body)?.[0]
    if (bullet) return [...lead, { text: bullet, kind: 'punct' }, ...highlightInline(body.slice(bullet.length))]

    return [...lead, ...highlightInline(body)]
}

/** Inline markdown: `code`, [text](url) and bare URLs.
 *
 * Emphasis (`**bold**`, `*italic*`) is deliberately left in the plain colour:
 * a README is mostly emphasis, and tinting all of it turns the panel into a
 * wall of one loud colour. Structure that carries meaning keeps its colour.
 */
const highlightInline = (line: string): Token[] => {
    const tokens: Token[] = []
    let plain = ''
    const flush = () => {
        if (plain) tokens.push({ text: plain, kind: 'plain' })
        plain = ''
    }
    const emit = (kind: TokenKind, value: string) => {
        flush()
        tokens.push({ text: value, kind })
    }

    let index = 0
    while (index < line.length) {
        const rest = line.slice(index)

        const code = /^`[^`\n]+`/.exec(rest)
        if (code) {
            emit('string', code[0])
            index += code[0].length
            continue
        }

        const link = /^!?\[[^\]]*\]\([^)\s]*\)/.exec(rest)
        if (link) {
            const open = link[0].lastIndexOf('(')
            emit('link', link[0].slice(0, open))
            emit('string', link[0].slice(open))
            index += link[0].length
            continue
        }

        const url = /^<?https?:\/\/[^\s)>]+>?/.exec(rest)
        if (url) {
            emit('link', url[0])
            index += url[0].length
            continue
        }

        plain += line[index]
        index += 1
    }

    flush()
    return tokens
}
