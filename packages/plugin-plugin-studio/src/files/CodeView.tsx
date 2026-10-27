/**
 * Plugin Studio — read-only, syntax-coloured source viewer.
 *
 * The Files tab shows one project file at a time, numbered, inside the panel's
 * scroll area. Colour comes from {@link highlight}'s semantic token kinds and
 * the palette below: two fixed sets (light / dark) rather than utility classes,
 * because inline styles are the only place a plugin can be sure its colours
 * survive the host CSS pipeline — and it keeps a file readable in either theme
 * without recompiling the plugin.
 *
 * Rendering is capped at `maxLines` so a huge generated file cannot stall the
 * window; the cap is reported in the original viewer's `…` marker.
 */
import React from 'react'
import { useResolvedTheme } from '@kn/ui'
import { highlight, languageOf, type TokenKind } from './highlight'

/** Colour per token kind; `punct`/`plain` inherit the surrounding text colour. */
type Palette = Partial<Record<TokenKind, string>>

/** One Light-ish: readable on the light panel background without shouting. */
const LIGHT: Palette = {
    comment: '#9aa0a6',
    string: '#3f8f4c',
    number: '#b76b01',
    keyword: '#a626a4',
    literal: '#986801',
    function: '#3f74d6',
    type: '#b07d1a',
    property: '#c1443c',
    tag: '#c1443c',
    attr: '#986801',
    heading: '#0b7bab',
    link: '#3f74d6',
    variable: '#3f74d6',
}

/** One Dark-ish: tuned against the dark card background rather than pure black. */
const DARK: Palette = {
    comment: '#7f848e',
    string: '#98c379',
    number: '#d19a66',
    keyword: '#c678dd',
    literal: '#d19a66',
    function: '#61afef',
    type: '#e5c07b',
    property: '#e06c75',
    tag: '#e06c75',
    attr: '#d19a66',
    heading: '#56b6c2',
    link: '#61afef',
    variable: '#61afef',
}

const ITALIC: ReadonlySet<TokenKind> = new Set<TokenKind>(['comment'])

export interface CodeViewProps {
    /** Raw file text; `\r\n` is normalised by the tokenizer. */
    text: string
    /** Project-relative path — the extension picks the tokenizer family. */
    path: string
    /** Lines past this are dropped with a `…` marker. */
    maxLines?: number
}

export const CodeView: React.FC<CodeViewProps> = ({ text, path, maxLines = 2000 }) => {
    const mode = useResolvedTheme()
    const palette = mode === 'dark' ? DARK : LIGHT

    const lines = React.useMemo(() => highlight(text, languageOf(path)), [text, path])
    const shown = lines.length > maxLines ? lines.slice(0, maxLines) : lines

    return (
        <>
            {shown.map((tokens, lineIndex) => (
                <div key={lineIndex} className="flex">
                    <span className="w-10 shrink-0 select-none pr-2 text-right text-muted-foreground/40 tabular-nums">
                        {lineIndex + 1}
                    </span>
                    <span className="min-w-0 flex-1 whitespace-pre-wrap break-words pr-3">
                        {tokens.length === 0
                            ? ' '
                            : tokens.map((token, tokenIndex) => {
                                  const color = palette[token.kind]
                                  if (!color) return <React.Fragment key={tokenIndex}>{token.text}</React.Fragment>
                                  return (
                                      <span
                                          key={tokenIndex}
                                          style={{
                                              color,
                                              fontStyle: ITALIC.has(token.kind) ? 'italic' : undefined,
                                          }}
                                      >
                                          {token.text}
                                      </span>
                                  )
                              })}
                    </span>
                </div>
            ))}
            {shown.length < lines.length ? (
                <div className="px-3 py-1 text-muted-foreground/70">…</div>
            ) : null}
        </>
    )
}
