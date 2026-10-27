/**
 * Plugin Studio — files-tab syntax colouring test.
 *
 * The viewer's colour is only worth having if it is *right*: a tokenizer that
 * colours half a string, swallows the rest of a file after an unterminated
 * block comment, or drops a line number turns a source reader into a lie. So
 * this test pins the two public contracts — which files get which scanner, and
 * what the scanner emits — plus the safety properties (line count preserved,
 * unterminated constructs stop at the line/EOF instead of eating the file).
 *
 * Run: node packages/plugin-plugin-studio/src/files/highlight.test.mjs
 */
import { highlight, languageOf } from './highlight.ts'

const results = []
const check = (name, condition, detail = '') => {
    results.push({ name, ok: Boolean(condition), detail })
    console.log(`${condition ? 'ok  ' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`)
}

/** Every token whose kind matches, across all lines. */
const tokensOf = (lines, kind) => lines.flat().filter((token) => token.kind === kind).map((token) => token.text)
const textOf = (lines) => lines.map((line) => line.map((token) => token.text).join('')).join('\n')

/* --- scanner selection ------------------------------------------------- */

const languageCases = [
    ['src/index.tsx', 'ts'],
    ['src/studio-tools.ts', 'ts'],
    ['dist/index.mjs', 'ts'],
    ['package.json', 'json'],
    ['manifest.jsonc', 'json'],
    ['src/styles.css', 'css'],
    ['src/theme.scss', 'css'],
    ['assets/icon.svg', 'markup'],
    ['pages/index.html', 'markup'],
    ['README.md', 'markdown'],
    ['docs/guide.mdx', 'markdown'],
    ['pnpm-workspace.yaml', 'yaml'],
    ['scripts/build.sh', 'shell'],
    ['Dockerfile', 'shell'],
    ['tools/pack.py', 'python'],
    ['LICENSE', 'text'],
    ['Makefile.not-an-extension-anyway', 'text'],
]
for (const [path, expected] of languageCases) {
    const actual = languageOf(path)
    check(`languageOf: ${path} → ${expected}`, actual === expected, actual === expected ? '' : `got ${actual}`)
}
check(
    'languageOf: picks the last extension, not a directory name',
    languageOf('md/docs/notes.ts') === 'ts',
    languageOf('md/docs/notes.ts'),
)

/* --- structure invariants ---------------------------------------------- */

const source = [
    "import React from 'react'",
    'const label = "button" // a label',
    '/* block',
    '   comment */',
    'const el = <div className="x">text</div>',
    '',
].join('\n')

const tsLines = highlight(source, 'ts')
check('structure: line count matches the file', tsLines.length === source.split('\n').length, `${tsLines.length}`)
check('structure: text round-trips', textOf(tsLines) === source)
check('structure: empty input yields one empty line', highlight('', 'ts').length === 1)
check('structure: a trailing newline opens an empty last line', highlight('a\n', 'ts').length === 2)
check('structure: CRLF is normalised', textOf(highlight('a\r\nb', 'ts')) === 'a\nb')

/* --- TS / TSX ----------------------------------------------------------- */

check('ts: keyword', tokensOf(tsLines, 'keyword').includes('const'), tokensOf(tsLines, 'keyword').join(','))
check('ts: import', tokensOf(tsLines, 'keyword').includes('import'))
check('ts: string literal', tokensOf(tsLines, 'string').includes('"button"'), tokensOf(tsLines, 'string').join(','))
check('ts: line comment', tokensOf(tsLines, 'comment').includes('// a label'))
check('ts: capitalised identifier reads as a type', tokensOf(highlight('const x: ChatMessage = y', 'ts'), 'type').includes('ChatMessage'))
check('ts: object key reads as a property', tokensOf(highlight('const m = { title: 1 }', 'ts'), 'property').includes('title'))
check('ts: ternary colon is not a property', tokensOf(highlight('const m = a ? b : c', 'ts'), 'property').length === 0)
check('ts: call target reads as a function', tokensOf(highlight('await streamKnowledgeText(x)', 'ts'), 'function').includes('streamKnowledgeText'))
check('ts: numbers', tokensOf(highlight('const n = 0x1f + 12.5', 'ts'), 'number').length === 2)

const blockLines = highlight('/* one\n   two\n   three */\nconst n = 1', 'ts')
check(
    'ts: block comment carries across lines',
    blockLines.slice(0, 3).every((line) => line.every((token) => token.kind === 'comment')),
    JSON.stringify(blockLines.slice(0, 3)),
)
check('ts: code after a block comment resumes', tokensOf(blockLines, 'keyword').includes('const'))

const templateLines = highlight('`a\n${b}\nc`', 'ts')
check(
    'ts: template literal spans lines as one string',
    templateLines.slice(0, 3).every((line) => line.every((token) => token.kind === 'string')),
    JSON.stringify(templateLines.slice(0, 3)),
)

const unterminated = highlight('const a = "oops\nconst b = 1', 'ts')
check('ts: unterminated string stops at the newline', unterminated[1]?.some((token) => token.text === 'const'))

/* --- JSX ---------------------------------------------------------------- */

const jsxLine = highlight('const el = <div className="x">hi</div>', 'ts')[0]
const jsxKinds = jsxLine.map((token) => `${token.kind}:${token.text}`)
check('tsx: tag name', jsxKinds.includes('tag:<div'), jsxKinds.join(' | '))
check('tsx: attribute name', jsxKinds.includes('attr:className'), jsxKinds.join(' | '))
check('tsx: attribute value', jsxKinds.includes('string:"x"'), jsxKinds.join(' | '))
check('tsx: comparison is not a tag', !jsxKinds.some((kind) => kind.startsWith('tag:')) || !tokensOf(highlight('a<b', 'ts'), 'tag').length)

/* --- JSON / YAML -------------------------------------------------------- */

const json = highlight('{\n  "name": "kotion",\n  "n": 3,\n  "off": false\n}', 'json')
check('json: key reads as a property', tokensOf(json, 'property').includes('"name"'), tokensOf(json, 'property').join(','))
check('json: literal', tokensOf(json, 'literal').includes('false'))
check('json: number', tokensOf(json, 'number').includes('3'))

const yaml = highlight('# app\nname: kotion\nport: 8080\nwatch: true', 'yaml')
check('yaml: comment', tokensOf(yaml, 'comment').includes('# app'))
check('yaml: key reads as a property', tokensOf(yaml, 'property').includes('name'), tokensOf(yaml, 'property').join(','))
check('yaml: number', tokensOf(yaml, 'number').includes('8080'))
check('yaml: literal', tokensOf(yaml, 'literal').includes('true'))

/* --- CSS ---------------------------------------------------------------- */

const css = highlight('/* theme */\n@media (min-width: 600px) {\n  .btn { color: #fff; --tone: 1 } }', 'css')
check('css: block comment', tokensOf(css, 'comment').includes('/* theme */'))
check('css: at-rule', tokensOf(css, 'keyword').includes('@media'), tokensOf(css, 'keyword').join(','))
check('css: property', tokensOf(css, 'property').includes('color'))
check('css: hex colour reads as a number', tokensOf(css, 'number').includes('#fff'))
check('css: custom property name', tokensOf(css, 'property').includes('--tone'), tokensOf(css, 'property').join(','))

/* --- markup ------------------------------------------------------------- */

const svg = highlight('<svg viewBox="0 0 24 24">\n  <path d="M0 0" />\n</svg>', 'markup')
check('markup: tag names', tokensOf(svg, 'tag').join(',') === 'svg,path,svg', tokensOf(svg, 'tag').join(','))
check('markup: attribute names', tokensOf(svg, 'attr').join(',') === 'viewBox,d', tokensOf(svg, 'attr').join(','))
check('markup: quoted values', tokensOf(svg, 'string').includes('"0 0 24 24"'))
check('markup: closing tag is one punct run', svg.flat().some((token) => token.kind === 'punct' && token.text === '</'))

const htmlComment = highlight('<!-- a\nb -->\n<b>x</b>', 'markup')
check(
    'markup: comment spans lines',
    htmlComment.slice(0, 2).every((line) => line.every((token) => token.kind === 'comment')),
    JSON.stringify(htmlComment.slice(0, 2)),
)
check('markup: element after a comment still colours', tokensOf(htmlComment, 'tag').join(',') === 'b,b')

/* --- markdown ----------------------------------------------------------- */

const markdown = ['# Studio', '', '- **bold** and `code`', '- [docs](https://example.com)', '```ts', 'const a = 1', '```', '> quote'].join('\n')
const mdLines = highlight(markdown, 'markdown')
check('markdown: heading', mdLines[0].some((token) => token.kind === 'heading' && token.text === '# Studio'))
check('markdown: list marker', mdLines[2].some((token) => token.kind === 'punct' && token.text === '- '))
check(
    'markdown: emphasis stays plain',
    !mdLines[2].some((token) => token.kind === 'keyword') && textOf([mdLines[2]]) === '- **bold** and `code`',
    JSON.stringify(mdLines[2]),
)
check('markdown: inline code', tokensOf(mdLines, 'string').includes('`code`'), tokensOf(mdLines, 'string').join(','))
check('markdown: link', tokensOf(mdLines, 'link').includes('[docs]'), tokensOf(mdLines, 'link').join(','))
check('markdown: fence is a comment', mdLines[4].every((token) => token.kind === 'comment'))
check('markdown: fenced body stays plain', mdLines[5].every((token) => token.kind === 'plain'), JSON.stringify(mdLines[5]))
check('markdown: fence closes', mdLines[6].every((token) => token.kind === 'comment'))
check('markdown: blockquote', mdLines[7].some((token) => token.kind === 'punct' && token.text === '> '))

/* --- shell / python ----------------------------------------------------- */

const shell = highlight('echo "hi $NAME" # greet\nfor f in *.ts; do echo $f; done', 'shell')
check('shell: line comment', tokensOf(shell, 'comment').includes('# greet'))
check('shell: builtin reads as a function', tokensOf(shell, 'function').includes('echo'), tokensOf(shell, 'function').join(','))
check('shell: keyword', tokensOf(shell, 'keyword').includes('for'), tokensOf(shell, 'keyword').join(','))
check('shell: variable', tokensOf(shell, 'variable').includes('$f'), tokensOf(shell, 'variable').join(','))

const python = highlight('"""doc\nstring"""\ndef run(self):\n    return None', 'python')
check(
    'python: triple-quoted string spans lines',
    python.slice(0, 2).every((line) => line.every((token) => token.kind === 'string')),
    JSON.stringify(python.slice(0, 2)),
)
check('python: keyword', tokensOf(python, 'keyword').includes('def'))
check('python: literal', tokensOf(python, 'literal').includes('None'))

/* --- plain text + robustness ------------------------------------------- */

const plain = highlight('just words\nmore words', 'text')
check('text: one plain run per line', plain.every((line) => line.every((token) => token.kind === 'plain')))
check('text: nothing is lost', textOf(plain) === 'just words\nmore words')

const junk = [
    '',
    '/*',
    '`',
    '"""',
    '<',
    '</',
    '<!--',
    '${',
    '#',
    '$',
    '\\',
    'a'.repeat(5000),
    '\u{1F600} const',
    '\u0000\u0001',
]
let broke = ''
for (const value of junk) {
    for (const language of ['ts', 'json', 'css', 'markup', 'markdown', 'yaml', 'shell', 'python', 'text']) {
        try {
            const lines = highlight(value, language)
            if (!lines.length) broke = `${language} returned no lines for ${JSON.stringify(value.slice(0, 12))}`
            else if (language !== 'text' && textOf(lines) !== value.replace(/\r\n?/g, '\n')) {
                broke = `${language} lost text for ${JSON.stringify(value.slice(0, 12))}`
            }
        } catch (error) {
            broke = `${language} threw for ${JSON.stringify(value.slice(0, 12))}: ${error.message}`
        }
    }
}
check('robustness: unterminated constructs never throw or lose text', broke === '', broke)

// The viewer redraws on every file open, so a 2000-line source must stay cheap.
const bulk = Array.from({ length: 2000 }, (_, index) => `const label${index} = "value ${index}" // line`).join('\n')
const startedAt = Date.now()
const bulkLines = highlight(bulk, 'ts')
const elapsed = Date.now() - startedAt
check(
    'performance: 2000 lines tokenize under 400ms',
    bulkLines.length === 2000 && elapsed < 400,
    `${elapsed}ms for ${bulkLines.length} lines`,
)

const failedChecks = results.filter((entry) => !entry.ok)
console.log(`\n${results.length - failedChecks.length}/${results.length} checks passed`)
process.exit(failedChecks.length ? 1 : 0)
