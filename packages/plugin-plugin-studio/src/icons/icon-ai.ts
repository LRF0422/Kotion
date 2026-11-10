/**
 * AI-designed plugin icons — prompt, extraction, sanitization, strict XML
 * validation and the streamed design loop.
 *
 * The studio's deterministic artwork (`./icon-art`) is offline and repeatable,
 * but an emoji on a tile is all an algorithm can draw. The AI path instead asks
 * the host's cloud model (AgentCore, via `streamKnowledgeText` from
 * `@kn/common`) for a real 512×512 SVG artwork and keeps the SAME file and
 * manifest contract — `assets/icon.svg` + `knPluginStudio.icon` — so previews,
 * publishing and the marketplace upload keep working unchanged.
 *
 * This module is deliberately free of imports (like `./icon-art`): the test
 * file imports it directly under Node, and the caller injects the model call.
 * Everything here is pure apart from the orchestrator's `AbortController`: it
 * builds the prompts, pulls the SVG out of a streamed reply, auto-fixes the safe
 * model mistakes, judges whether the document is safe to ship, and runs the
 * streamed design / repair rounds against a hard wall-clock budget.
 *
 * Why the validation is strict: a model reply is untrusted input, and this
 * artwork is rendered through `<img src>` in the studio preview and the
 * marketplace. Invalid XML shows a broken image instead of the icon (the
 * nested-double-quote incident `./icon-art` documents), and scripts, external
 * references or stylesheets would be a security problem the moment the SVG is
 * opened directly. The well-formedness scanner is hand-written because a regex
 * cannot tell an attribute value that legitimately contains a quote *entity*
 * from a model that nested a raw double quote and broke the document.
 */

/** Canvas the model is asked to draw on (the SVG itself scales to anything). */
export const AI_ICON_SIZE = 512

/**
 * Upper bound for one streamed reply. A real 512×512 artwork is a few KB; this
 * only stops a runaway generation from ballooning memory or the run budget.
 */
export const AI_ICON_MAX_CHARS = 48_000

/** Wall-clock budget for one whole design run, all repair rounds included. */
export const AI_ICON_TIMEOUT_MS = 120_000

/**
 * Repair rounds after the initial attempt. Two rounds is the budget: a model
 * that cannot produce valid XML after concrete feedback twice will not be saved
 * by a fourth try, and every extra round is another paid request.
 */
export const AI_ICON_REPAIR_ROUNDS = 2

/** A shippable icon is a few KB; below this it cannot be a real artwork. */
export const AI_ICON_MIN_SVG_CHARS = 200

/** Hard ceiling for a document `validateIconSvg` will accept. */
export const AI_ICON_MAX_SVG_CHARS = 200_000

/**
 * System instruction for the icon run. Written as hard rules because the model
 * also writes the SVG source — every constraint here is one that, when broken,
 * produces a broken image, an unloadable asset or a rejected upload. The last
 * rule is a self-check: asking for the checks explicitly measurably reduces the
 * classic failures (unclosed tags, bare `&`, external `href`).
 */
export const AI_ICON_SYSTEM_PROMPT = [
    '你是资深 App 图标设计师，为 Kotion 知识库应用的插件市场设计插件图标。',
    '必须严格遵守以下规则：',
    `1. 只输出一张完整、合法的 SVG 文档：${AI_ICON_SIZE}×${AI_ICON_SIZE}，viewBox="0 0 ${AI_ICON_SIZE} ${AI_ICON_SIZE}"；不要任何解释文字，不要 Markdown 代码围栏。`,
    '2. 自包含：不引用任何外部资源——禁止 <image>、<script>、<style>、<foreignObject>、@import、事件处理属性（on*）；href 只能写文档内片段（如 href="#shape"），禁止 http/data/相对路径与 url(http…)。',

    '3. 视觉：现代扁平 App 图标——圆角方形底色（rx≈112）+ 平滑渐变（2–3 个色停）+ 一个居中的图形符号；可以有柔和高光或内阴影，但整体干净克制。',
    '4. 不出现文字、字母、数字或水印；符号用基础图形（rect/circle/path 等）简洁绘制。',
    "5. XML 必须严格合法：属性值内不能嵌套双引号（字体栈用单引号，如 font-family=\"'A', sans-serif\"）；裸 & 必须写成 &amp;；标签必须成对闭合，< 不能出现在属性值里；同一元素不能有同名属性；如需命名空间前缀（xlink: 等）必须在根 <svg> 上声明对应 xmlns:前缀（优先用不带前缀的 href）。",
    '6. 输出前自检：根元素是否带 xmlns 与 viewBox？标签是否全部闭合？属性值是否都有引号且不重复？是否有裸 & 或非法实体？引用是否都是 #id？是否引用了外部资源？确认无误后只输出 SVG。',
].join('\n')

export interface AiIconPromptInput {
    /** Plugin key / directory name — always part of the prompt. */
    seed: string
    /** Human title (display name), when the project declares one. */
    title?: string
    /** Free-text design brief typed by the author; may be empty. */
    brief?: string
}

/**
 * The user-side prompt: who the plugin is, plus the author's brief. The visual
 * rules live in the system prompt so a retry with a new brief does not have to
 * repeat them.
 */
export const buildAiIconPrompt = (input: AiIconPromptInput): string => {
    const name = input.title?.trim() || input.seed
    const lines = [`插件名：${name}（标识：${input.seed}）`]
    const brief = input.brief?.trim()
    if (brief) lines.push(`设计要求：${brief}`)
    lines.push('请结合插件用途挑选贴切的视觉主题与配色，直接输出 SVG。')
    return lines.join('\n')
}

/**
 * Repair round: the previous reply plus every concrete problem, so the model
 * fixes the document instead of re-rolling the dice. `attempt` only labels the
 * round; the caller owns the budget.
 */
export const buildAiIconRepairPrompt = (previous: string, problems: readonly string[], attempt = 1): string =>
    [
        '你上次输出的 SVG 不满足要求，存在以下问题：',
        ...problems.map((problem) => `- ${problem}`),
        '',
        '上次输出：',
        previous,
        '',
        `这是第 ${attempt} 轮修复：请逐条修正上述全部问题，只重新输出完整的 SVG 文档，不要解释。`,
    ].join('\n')

/**
 * Pull the SVG document out of a streamed reply.
 *
 * Replies come wrapped in prose or ```svg fences no matter how the prompt is
 * worded, so the extractor takes the first `<svg` to the last `</svg>` — the
 * longest plausible document — and lets sanitization and validation judge the
 * contents.
 */
export const extractIconSvg = (text: string): string | null => {
    if (!text) return null
    const start = text.indexOf('<svg')
    const end = text.lastIndexOf('</svg>')
    if (start === -1 || end === -1 || end < start) return null
    return text.slice(start, end + '</svg>'.length).trim()
}

/* ------------------------------------------------------------------ *
 * XML primitives
 * ------------------------------------------------------------------ */

const XML_NAME_START = /[A-Za-z_:]/
const XML_NAME_CHAR = /[A-Za-z0-9_.:-]/
const WHITESPACE = /\s/

/** A numeric character reference, split into decimal / hex. */
const NUMERIC_ENTITY = /^&#(?:(\d+)|x([0-9a-fA-F]+));/

/** The five predefined named entities XML allows without a DTD. */
const NAMED_ENTITY = /^&(amp|lt|gt|quot|apos);/

/** A `&` that does not start a valid XML entity — what sanitization escapes. */
const BARE_AMPERSAND = /&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/g

/**
 * XML 1.0 Char production: only these code points may appear in a document.
 * Character references are validated against it because `&#0;` and a lone
 * surrogate are well-formed-looking but make the document unparsable.
 */
const isValidXmlCodePoint = (code: number): boolean =>
    code === 0x9
    || code === 0xa
    || code === 0xd
    || (code >= 0x20 && code <= 0xd7ff)
    || (code >= 0xe000 && code <= 0xfffd)
    || (code >= 0x10000 && code <= 0x10ffff)

/** True when a LITERAL string contains a code point XML forbids. */
const hasInvalidXmlCharacter = (value: string): boolean => {
    for (const character of value) {
        const code = character.codePointAt(0)
        if (code !== undefined && !isValidXmlCodePoint(code)) return true
    }
    return false
}

/**
 * Split a QName into its prefix. `''` means "no prefix", `null` means the name
 * is not a legal QName (more than one colon, or an empty part). Namespace
 * declarations (`xmlns:p`) are handled separately by the caller.
 */
const qNamePrefix = (name: string): string | null => {
    const parts = name.split(':')
    if (parts.length === 1) return ''
    if (parts.length !== 2 || !parts[0] || !parts[1]) return null
    return parts[0]
}

const NAMED_ENTITY_VALUE: Record<string, string> = {
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'",
}

/**
 * Decode XML character/entity references.
 *
 * Security checks have to run on the DECODED text, not the raw source: a
 * browser decodes `u&#114;l(http://…)` to `url(http://…)` before it resolves
 * the reference, so a raw-text regex would miss an external-reference bypass.
 */
const decodeXmlReferences = (value: string): string =>
    value.replace(/&(?:#(\d+)|#x([0-9a-fA-F]+)|(amp|lt|gt|quot|apos));/g, (match, decimal, hex, name) => {
        if (typeof name === 'string') return NAMED_ENTITY_VALUE[name] ?? match
        const code = typeof decimal === 'string' ? Number(decimal) : parseInt(hex, 16)
        if (!Number.isFinite(code) || !isValidXmlCodePoint(code)) return match
        return String.fromCodePoint(code)
    })

/**
 * Decode CSS backslash escapes (`u\72l(` → `url(`).
 *
 * An SVG presentation attribute / `style` attribute is parsed as CSS, where
 * backslash escapes are legal. Normalizing them keeps the reference check
 * independent of how the model (or an attacker) wrote the token.
 */
const decodeCssEscapes = (value: string): string =>
    value.replace(/\\(?:([0-9a-fA-F]{1,6})\s?|([\s\S]))/g, (_match, hex, literal) => {
        if (typeof hex === 'string') {
            const code = parseInt(hex, 16)
            if (!Number.isFinite(code) || !isValidXmlCodePoint(code)) return ''
            return String.fromCodePoint(code)
        }
        return typeof literal === 'string' ? literal : ''
    })

/**
 * Strip comments, CDATA sections and processing instructions.
 *
 * Used for the tag/attribute scans: text there is inert and must not trip a
 * security or drawing check (a `<desc>` mentioning `url(http://…)` is prose,
 * and a comment containing `<script>` is not a script element).
 */
const stripInertRegions = (doc: string): string =>
    doc.replace(/<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[\s\S]*?\?>/g, ' ')

/** Strip only comments/CDATA (keeps real processing instructions for detection). */
const stripCommentsAndCdata = (doc: string): string =>
    doc.replace(/<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>/g, ' ')

/**
 * Comments, CDATA sections and processing instructions are copied verbatim by
 * sanitization: text inside them is not parsed as XML, so escaping `&` there
 * would change the document instead of fixing it.
 */
const PROTECTED_XML_REGION = /(<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[\s\S]*?\?>)/g

/** Index of the `>` that closes the tag starting at `start`, quote-aware. */
const findOpeningTagEnd = (doc: string, start: number): number => {
    let quote: string | null = null
    for (let index = start + 1; index < doc.length; index += 1) {
        const char = doc[index]
        if (quote) {
            if (char === quote) quote = null
            continue
        }
        if (char === '"' || char === "'") {
            quote = char
            continue
        }
        if (char === '>') return index
    }
    return -1
}

/** Drop BOM, leading whitespace, comments, PIs and an XML declaration. */
const stripLeadingProlog = (value: string): string => {
    let rest = value.replace(/^\uFEFF/, '').trimStart()
    for (;;) {
        if (rest.startsWith('<!--')) {
            const end = rest.indexOf('-->')
            if (end === -1) return rest
            rest = rest.slice(end + 3).trimStart()
            continue
        }
        if (rest.startsWith('<?')) {
            const end = rest.indexOf('?>')
            if (end === -1) return rest
            rest = rest.slice(end + 2).trimStart()
            continue
        }
        return rest
    }
}

/** The root opening tag as written (quote-aware, so `attr="a>b"` is safe). */
const readRootTag = (doc: string): string => {
    const start = doc.indexOf('<')
    if (start === -1) return ''
    const end = findOpeningTagEnd(doc, start)
    return end === -1 ? doc.slice(start) : doc.slice(start, end + 1)
}

/**
 * Hand-written well-formedness scan for the subset of XML an SVG icon uses.
 *
 * It catches the failures a regex cannot: unclosed / mismatched tags, unquoted
 * attributes, a `<` inside an attribute value, an attribute value that contains
 * the closing quote (the historical nested-double-quote incident), invalid
 * entity references, unterminated comments / CDATA / PIs, and DOCTYPE (which is
 * how external-entity tricks get in). Every message is user- and model-facing,
 * so it says what is wrong and where.
 */
const scanXmlProblems = (doc: string): string[] => {
    const problems: string[] = []
    const report = (problem: string): void => {
        if (!problems.includes(problem)) problems.push(problem)
    }
    const stack: string[] = []
    /**
     * Namespace declarations are scoped to the element that carries them (and
     * its descendants), exactly like XML namespaces. A global set would let a
     * prefix declared inside one `<g>` leak to following siblings, which
     * browsers reject. `xml` and `xmlns` are predefined.
     */
    const namespaceScopes: Array<Set<string>> = [new Set(['xml', 'xmlns'])]
    const currentPrefixes = (): Set<string> =>
        namespaceScopes[namespaceScopes.length - 1] ?? new Set(['xml', 'xmlns'])
    let rootSeen = false
    let index = 0
    let guard = 0
    const length = doc.length

    const checkEntities = (text: string): void => {
        let cursor = 0
        for (;;) {
            const ampersand = text.indexOf('&', cursor)
            if (ampersand === -1) return
            const rest = text.slice(ampersand)
            const named = NAMED_ENTITY.exec(rest)
            if (named) {
                cursor = ampersand + named[0].length
                continue
            }
            const numeric = NUMERIC_ENTITY.exec(rest)
            if (numeric) {
                const code = typeof numeric[1] === 'string' ? Number(numeric[1]) : parseInt(numeric[2], 16)
                if (!isValidXmlCodePoint(code)) {
                    report('包含非法的字符引用（XML 不允许该码点，例如 &#0; 或孤立代理项）')
                }
                cursor = ampersand + numeric[0].length
                continue
            }
            if (/^&[A-Za-z][A-Za-z0-9._-]*;/.test(rest)) {
                report('包含无效的实体引用（XML 只支持 &amp; &lt; &gt; &quot; &apos; 和数字字符引用）')
            } else {
                report('包含未转义的 &（应写成 &amp;）')
            }
            cursor = ampersand + 1
        }
    }

    const checkText = (text: string): void => {
        if (!text) return
        if (hasInvalidXmlCharacter(text)) report('包含 XML 不允许的控制字符')
        if (text.includes(']]>')) report('文本内容里不能出现 ]]>')
        if (text.trim() && !stack.length) {
            report(rootSeen ? '根元素 <svg> 之外不能有文本内容' : '根元素 <svg> 之前不能有文本内容')
        }
        checkEntities(text)
    }

    while (index < length) {
        guard += 1
        if (guard > length + 16) {
            report('XML 结构无法解析')
            break
        }
        const open = doc.indexOf('<', index)
        if (open === -1) {
            checkText(doc.slice(index))
            break
        }
        if (open > index) checkText(doc.slice(index, open))

        if (doc.startsWith('<!--', open)) {
            const end = doc.indexOf('-->', open + 4)
            if (end === -1) {
                report('注释未闭合（缺少 -->）')
                break
            }
            // XML's Char production applies to comments too.
            if (hasInvalidXmlCharacter(doc.slice(open + 4, end))) report('包含 XML 不允许的控制字符')
            index = end + 3
            continue
        }
        if (doc.startsWith('<![CDATA[', open)) {
            const end = doc.indexOf(']]>', open + 9)
            if (end === -1) {
                report('CDATA 段未闭合（缺少 ]]>）')
                break
            }
            if (!stack.length) report('CDATA 段不能出现在根元素之外')
            if (hasInvalidXmlCharacter(doc.slice(open + 9, end))) report('包含 XML 不允许的控制字符')
            index = end + 3
            continue
        }
        if (doc.startsWith('<?', open)) {
            const end = doc.indexOf('?>', open + 2)
            if (end === -1) {
                report('处理指令未闭合（缺少 ?>）')
                break
            }
            index = end + 2
            continue
        }
        if (/^<!doctype/i.test(doc.slice(open, open + 9))) {
            report('包含 DOCTYPE 声明（外部实体风险，已拒绝）')
            const end = doc.indexOf('>', open + 2)
            index = end === -1 ? length : end + 1
            continue
        }
        if (doc.startsWith('<!', open)) {
            report('包含不支持的 XML 声明（只允许注释、CDATA 与处理指令）')
            const end = doc.indexOf('>', open + 2)
            index = end === -1 ? length : end + 1
            continue
        }
        if (doc.startsWith('</', open)) {
            const closeEnd = doc.indexOf('>', open + 2)
            if (closeEnd === -1) {
                report('结束标签未闭合（缺少 >）')
                break
            }
            const rawName = doc.slice(open + 2, closeEnd).trim()
            if (!rawName) {
                report('结束标签缺少名称')
                index = closeEnd + 1
                continue
            }
            const closeName = rawName.split(/\s+/)[0]
            if (rawName !== closeName) report(`结束标签 </${closeName}> 内不应有其他内容`)
            if (!/^[A-Za-z_:][A-Za-z0-9_.:-]*$/.test(closeName)) report('结束标签名称非法')
            if (qNamePrefix(closeName) === null) report(`结束标签名称 ${closeName} 不是合法的 QName（最多一个冒号且两段都不能为空）`)
            if (!stack.length) {
                report(`多余的结束标签 </${closeName}>`)
            } else {
                const expected = stack.pop() ?? ''
                if (expected !== closeName) report(`标签不匹配：<${expected}> 与 </${closeName}>`)
                if (namespaceScopes.length > 1) namespaceScopes.pop()
            }
            index = closeEnd + 1
            continue
        }

        // Opening tag: name, then attributes.
        let cursor = open + 1
        if (!XML_NAME_START.test(doc[cursor] ?? '')) {
            report('标签名非法（< 后必须是标签名）')
            index = open + 1
            continue
        }
        const nameStart = cursor
        cursor += 1
        while (cursor < length && XML_NAME_CHAR.test(doc[cursor])) cursor += 1
        const name = doc.slice(nameStart, cursor)
        if (!stack.length) {
            if (rootSeen) report('存在多个根元素（只能有一个 <svg> 根）')
            rootSeen = true
            if (name !== 'svg') report('根元素必须是 <svg>')
        }
        const elementPrefix = qNamePrefix(name)
        if (elementPrefix === null) {
            report(`标签名 ${name} 不是合法的 QName（最多一个冒号且两段都不能为空）`)
        }
        const usedPrefixes: string[] = elementPrefix ? [elementPrefix] : []
        const seenAttributes = new Set<string>()
        const scope = new Set(currentPrefixes())
        const tagDeclarations: string[] = []

        let selfClosing = false
        let tagClosed = false
        while (cursor < length) {
            while (cursor < length && WHITESPACE.test(doc[cursor])) cursor += 1
            if (cursor >= length) break
            const char = doc[cursor]
            if (char === '>') {
                cursor += 1
                tagClosed = true
                break
            }
            if (char === '/' && doc[cursor + 1] === '>') {
                cursor += 2
                selfClosing = true
                tagClosed = true
                break
            }
            if (char === '<') {
                report(`标签 <${name}> 未闭合（缺少 >）`)
                break
            }
            if (!XML_NAME_START.test(char)) {
                report(`标签 <${name}> 的属性语法错误（属性必须写成 name="value"）`)
                const before = cursor
                while (
                    cursor < length
                    && !WHITESPACE.test(doc[cursor])
                    && doc[cursor] !== '>'
                    && !(doc[cursor] === '/' && doc[cursor + 1] === '>')
                ) {
                    cursor += 1
                }
                if (cursor === before) cursor += 1
                continue
            }
            const attributeStart = cursor
            cursor += 1
            while (cursor < length && XML_NAME_CHAR.test(doc[cursor])) cursor += 1
            const attributeName = doc.slice(attributeStart, cursor)
            // XML forbids the same attribute twice on one element. Browsers
            // reject the document, and a duplicated `fill`/`href` is exactly how
            // a "later value wins" assumption would drift between parsers.
            if (seenAttributes.has(attributeName)) {
                report(`属性 ${attributeName} 重复（XML 不允许同名属性）`)
            } else {
                seenAttributes.add(attributeName)
            }
            if (attributeName.startsWith('xmlns:')) {
                const declared = attributeName.slice('xmlns:'.length)
                if (!declared) report(`属性 ${attributeName} 缺少命名空间前缀名`)
                else if (declared.includes(':')) report(`属性 ${attributeName} 的命名空间前缀不能包含冒号`)
                else if (declared === 'xmlns') report('命名空间前缀 xmlns 是保留字，不能重新声明')
                else tagDeclarations.push(declared)
            } else if (attributeName !== 'xmlns') {
                const attributePrefix = qNamePrefix(attributeName)
                if (attributePrefix === null) {
                    report(`属性名 ${attributeName} 不是合法的 QName（最多一个冒号且两段都不能为空）`)
                } else if (attributePrefix) {
                    usedPrefixes.push(attributePrefix)
                }
            }
            while (cursor < length && WHITESPACE.test(doc[cursor])) cursor += 1
            if (doc[cursor] !== '=') {
                report(`属性 ${attributeName} 缺少值（必须写成 ${attributeName}="..."）`)
                continue
            }
            cursor += 1
            while (cursor < length && WHITESPACE.test(doc[cursor])) cursor += 1
            const quote = doc[cursor]
            if (quote !== '"' && quote !== "'") {
                report(`属性 ${attributeName} 的值必须用引号括起来`)
                while (cursor < length && !WHITESPACE.test(doc[cursor]) && doc[cursor] !== '>') cursor += 1
                continue
            }
            cursor += 1
            const valueStart = cursor
            let valueEnd = -1
            while (cursor < length) {
                if (doc[cursor] === quote) {
                    valueEnd = cursor
                    break
                }
                if (doc[cursor] === '<') break
                cursor += 1
            }
            if (valueEnd === -1) {
                if (cursor < length && doc[cursor] === '<') report(`属性 ${attributeName} 的值里不能出现 <`)
                else report(`属性 ${attributeName} 的值缺少结束引号`)
                break
            }
            const rawValue = doc.slice(valueStart, valueEnd)
            checkEntities(rawValue)
            if (hasInvalidXmlCharacter(rawValue)) report('属性值里包含 XML 不允许的控制字符')
            if (attributeName === 'xmlns:xml' && rawValue !== 'http://www.w3.org/XML/1998/namespace') {
                report('xml 是保留前缀，只能绑定到 http://www.w3.org/XML/1998/namespace')
            }
            cursor = valueEnd + 1
            if (cursor < length && !WHITESPACE.test(doc[cursor]) && doc[cursor] !== '>' && doc[cursor] !== '/') {
                report('属性值里嵌套了双引号，整份文档会解析失败')
            }
        }

        for (const declared of tagDeclarations) scope.add(declared)
        namespaceScopes.push(scope)
        for (const prefix of usedPrefixes) {
            if (!scope.has(prefix)) {
                report(`使用了未声明的命名空间前缀：${prefix}（需要在根元素声明 xmlns:${prefix}）`)
            }
        }
        if (!tagClosed) {
            // Everything after a half-parsed tag is untrustworthy.
            namespaceScopes.pop()
            index = cursor > open ? cursor : length
            break
        }
        if (selfClosing) namespaceScopes.pop()
        else stack.push(name)
        index = cursor
    }

    if (stack.length) report(`标签未闭合：<${stack[stack.length - 1]}> 缺少结束标签`)
    if (!rootSeen) report('没有找到根元素 <svg>')
    return problems
}

/* ------------------------------------------------------------------ *
 * Sanitization — safe, common model slips only
 * ------------------------------------------------------------------ */

/**
 * Fix the mistakes a model makes that are unambiguously safe to repair, and
 * nothing else. In particular this never removes scripts, styles or external
 * references: hiding unsafe content would let it ship. Those are rejected by
 * `validateIconSvg` instead, and the model gets a repair round.
 */
export const sanitizeIconSvg = (svg: string): string => {
    if (!svg) return ''
    let doc = svg.replace(/\r\n?/g, '\n').replace(/^\uFEFF/, '').trim()

    // An XML declaration is legal XML but not part of the artwork; the caller
    // writes the file from scratch, so it is dropped.
    doc = stripLeadingXmlDeclaration(doc).trimStart()
    // Prose or a stray fence around the document (the extractor normally did
    // this already; doing it here keeps `sanitizeIconSvg` safe on its own).
    const svgStart = doc.indexOf('<svg')
    if (svgStart > 0) doc = doc.slice(svgStart)
    const svgEnd = doc.lastIndexOf('</svg>')
    if (svgEnd !== -1) doc = doc.slice(0, svgEnd + '</svg>'.length)

    // Bare `&` is the most common XML mistake and always means the literal
    // character. Comments / CDATA / PIs are copied verbatim.
    doc = doc
        .split(PROTECTED_XML_REGION)
        .map((segment, position) => (position % 2 === 1 ? segment : segment.replace(BARE_AMPERSAND, '&amp;')))
        .join('')

    // A missing default namespace is safe to add: without it standalone SVG
    // does not render at all, and adding it cannot change a valid document.
    if (/^<svg(?=[\s/>])/.test(doc)) {
        const tagEnd = findOpeningTagEnd(doc, 0)
        if (tagEnd !== -1) {
            const rootTag = doc.slice(0, tagEnd + 1)
            // Attribute-boundary aware: `data-xmlns=` is NOT the namespace.
            if (!/(?:^|\s)xmlns\s*=/.test(rootTag)) {
                doc = `<svg xmlns="http://www.w3.org/2000/svg"${doc.slice('<svg'.length)}`
            }
        }
    }

    return doc.trim()
}

/* ------------------------------------------------------------------ *
 * Validation — may this document be written into a project?
 * ------------------------------------------------------------------ */

/**
 * Tags that must never appear in a shippable, self-contained icon. Not global:
 * `validateIconSvg` is called many times per process and a global `exec` would
 * carry `lastIndex` from one document into the next.
 *
 * Scanned on the markup-only view (comments / CDATA / PIs stripped), so prose
 * or a commented-out example cannot trip it.
 */
const FORBIDDEN_TAG =
    /<\s*(?:[A-Za-z_][A-Za-z0-9_.-]*:)?(script|style|foreignObject|iframe|image|embed|object|audio|video|animate[A-Za-z]*|set)(?=[\s/>])/i

/**
 * A leading `<?xml … ?>` declaration is legal XML and is stripped by
 * `sanitizeIconSvg` before the file is written. Any OTHER processing
 * instruction is rejected: `<?xml-stylesheet href="http://…"?>` makes the SVG
 * pull external CSS the moment it is opened directly.
 */
const stripLeadingXmlDeclaration = (value: string): string => {
    const match = /^\uFEFF?\s*<\?xml(?:\s[\s\S]*?)?\?>/i.exec(value)
    return match ? value.slice(match[0].length) : value
}

/**
 * At least one element that actually draws something. `g` is deliberately not
 * in the list (a bare group renders nothing), and the check runs on the
 * markup-only view so a primitive existing only inside a comment does not count.
 */
const DRAWING_PRIMITIVE =
    /<(?:[A-Za-z_][A-Za-z0-9_.-]*:)?(path|rect|circle|ellipse|polygon|polyline|line)(?=[\s/>])/

/** One attribute of an opening tag, with its raw (still-encoded) value. */
interface IconAttribute {
    name: string
    value: string
}

/**
 * Collect every attribute written on an opening tag, quote-aware and outside
 * comments / CDATA / PIs.
 *
 * Reference checks run over ATTRIBUTE VALUES rather than the whole document:
 * `href`, `fill="url(…)"` and `style="…"` are the only places a URL takes
 * effect, while `<desc>see url(http://x)</desc>` is prose. The values are then
 * DECODED (`u&#114;l(` → `url(`) before judging them — a raw-text regex is
 * exactly the bypass this closes.
 */
const collectAttributes = (doc: string): IconAttribute[] => {
    const attributes: IconAttribute[] = []
    let index = 0
    while (index < doc.length) {
        const open = doc.indexOf('<', index)
        if (open === -1) break
        if (doc.startsWith('<!--', open)) {
            const end = doc.indexOf('-->', open + 4)
            index = end === -1 ? doc.length : end + 3
            continue
        }
        if (doc.startsWith('<![CDATA[', open)) {
            const end = doc.indexOf(']]>', open + 9)
            index = end === -1 ? doc.length : end + 3
            continue
        }
        if (doc.startsWith('<?', open)) {
            const end = doc.indexOf('?>', open + 2)
            index = end === -1 ? doc.length : end + 2
            continue
        }
        if (doc.startsWith('</', open)) {
            const end = doc.indexOf('>', open + 2)
            index = end === -1 ? doc.length : end + 1
            continue
        }
        const end = findOpeningTagEnd(doc, open)
        if (end === -1) break
        const tag = doc.slice(open, end + 1)
        const pattern = /([A-Za-z_:][A-Za-z0-9_.:-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g
        for (;;) {
            const match = pattern.exec(tag)
            if (!match) break
            attributes.push({ name: match[1], value: match[2] ?? match[3] ?? '' })
        }
        index = end + 1
    }
    return attributes
}

/**
 * In-document fragment. Unicode is allowed (SVG ids are XML names, and models
 * do emit `gradient-cn`-style ids such as `#渐变`); anything that could name a
 * document/external base (`/`, `.`, `:`, whitespace, quotes) is not.
 */
const isFragmentReference = (target: string): boolean => /^#[^\s"'<>()]+$/.test(target)

/**
 * Attributes whose value is parsed as a CSS paint/filter reference, i.e. the
 * only places `url(...)` can actually load something. Restricting the scan to
 * them (plus `style`) avoids false positives on descriptive attributes such as
 * `aria-label="see url(http://example.com)"`, which never resolve a reference.
 */
const URL_REFERENCE_ATTRIBUTES = new Set([
    'fill', 'stroke', 'filter', 'clip-path', 'mask',
    'marker', 'marker-start', 'marker-mid', 'marker-end',
    'cursor', 'color', 'flood-color', 'lighting-color', 'stop-color',
])

/** Reject any `url(...)` whose target is not an in-document fragment. */
const reportUrlReferences = (value: string, add: (problem: string) => void): void => {
    const pattern = /url\(\s*([^)]*)\)/gi
    for (;;) {
        const match = pattern.exec(value)
        if (!match) break
        const target = match[1].trim().replace(/^['"]|['"]$/g, '').trim()
        if (!isFragmentReference(target)) {
            add(`包含外部引用或脚本：url(${target.slice(0, 40)}) 只能引用文档内的 #id`)
            return
        }
    }
}

/** Security-relevant problems, checked on the decoded document surface. */
const securityProblems = (doc: string): string[] => {
    const problems: string[] = []
    const add = (problem: string): void => {
        if (!problems.includes(problem)) problems.push(problem)
    }

    // Run on the comments/CDATA-stripped view: `<?` inside inert text is prose,
    // not a processing instruction (`<?xml-stylesheet?>` is the dangerous one).
    if (stripLeadingXmlDeclaration(stripCommentsAndCdata(doc)).includes('<?')) {
        add('包含外部引用或脚本：不允许处理指令（<? … ?>），它可能引入外部样式表')
    }
    const markup = stripInertRegions(doc)
    const forbidden = FORBIDDEN_TAG.exec(markup)
    if (forbidden) {
        add(`包含外部引用或脚本：<${forbidden[1]}> 不允许出现在图标中`)
    }

    for (const attribute of collectAttributes(doc)) {
        const hasPrefix = attribute.name.includes(':')
        const local = hasPrefix ? attribute.name.slice(attribute.name.indexOf(':') + 1) : attribute.name
        if (!hasPrefix && /^on[a-z]+$/i.test(attribute.name)) {
            add(`包含事件处理属性（${attribute.name.toLowerCase()}），图标不允许任何脚本行为`)
            continue
        }
        const localName = local.toLowerCase()
        // XML entities decode in every attribute. CSS escapes only decode where
        // the value is parsed as CSS (style / paint attributes) — an `href` is a
        // URL, not CSS, so `href="\23 x"` must NOT be mistaken for `#x`.
        const xmlValue = decodeXmlReferences(attribute.value)
        const cssValue = localName === 'style' || URL_REFERENCE_ATTRIBUTES.has(localName)
            ? decodeCssEscapes(xmlValue)
            : xmlValue
        if (localName === 'href' && !isFragmentReference(xmlValue.trim())) {
            add('包含外部引用或脚本：href 只能指向文档内的 #id，不能是外部、协议相对或文件地址')
        }
        if ((localName === 'href' && /javascript\s*:/i.test(xmlValue)) || (localName === 'style' && /javascript\s*:/i.test(cssValue))) {
            add('包含外部引用或脚本：禁止 javascript: 伪协议')
        }
        if (localName === 'style' && /@import/i.test(cssValue)) {
            add('包含外部引用或脚本：禁止 @import')
        }
        if (localName === 'style' || URL_REFERENCE_ATTRIBUTES.has(localName)) {
            reportUrlReferences(cssValue, add)
        }
    }
    return problems
}

/**
 * Everything that must hold before an AI-designed SVG may be written into a
 * project. Returns the problems found — empty means safe to ship. Strings are
 * surfaced to the user (and to the model as the repair prompt), so they say
 * what is wrong, not just that something is.
 *
 * This is intentionally stricter than "it renders": the file is opened directly
 * by some consumers, so scripts, external references and stylesheets are
 * rejected even when a browser would tolerate them.
 */
export const validateIconSvg = (svg: string): string[] => {
    const raw = (svg ?? '').replace(/\r\n?/g, '\n').trim()
    if (!raw) return ['内容为空，不是一张 SVG 图标']

    const problems: string[] = []
    const doc = stripLeadingProlog(raw)
    const startsWithSvg = doc.startsWith('<svg')
    if (!startsWithSvg || !raw.endsWith('</svg>')) {
        problems.push('不是以 <svg 开头、以 </svg> 结束的完整文档')
    }

    const rootTag = startsWithSvg ? readRootTag(doc) : ''
    if (rootTag) {
        // Attribute-boundary aware on purpose: `data-xmlns=` / `data-viewBox=`
        // are unrelated attributes, not the canvas declaration.
        if (!/(?:^|\s)xmlns\s*=\s*(?:"http:\/\/www\.w3\.org\/2000\/svg"|'http:\/\/www\.w3\.org\/2000\/svg')/.test(rootTag)) {
            problems.push('缺少 xmlns="http://www.w3.org/2000/svg"')
        }
        // The root tag specifically: an inner shape's width/height (a rect)
        // must not count as the canvas declaration.
        if (!/(?:^|\s)viewBox\s*=/.test(rootTag)
            && !(/(?:^|\s)width\s*=/.test(rootTag) && /(?:^|\s)height\s*=/.test(rootTag))) {
            problems.push('缺少 viewBox 或 width/height')
        }
    }

    problems.push(...scanXmlProblems(raw))
    problems.push(...securityProblems(raw))

    if (raw.length < AI_ICON_MIN_SVG_CHARS) {
        problems.push('内容太短，不像一张完整图标')
    } else if (raw.length > AI_ICON_MAX_SVG_CHARS) {
        problems.push(`内容过长（超过 ${AI_ICON_MAX_SVG_CHARS} 字符），不是一张正常图标`)
    } else if (!DRAWING_PRIMITIVE.test(stripInertRegions(raw))) {
        problems.push('没有可渲染的图形元素')
    }

    return [...new Set(problems)]
}

/* ------------------------------------------------------------------ *
 * One reply → a shippable SVG (extract → sanitize → validate)
 * ------------------------------------------------------------------ */

export interface IconReplyPreparation {
    /** The extracted + sanitized document, even when it is invalid. */
    candidate: string | null
    /** The shippable document, or `null` when problems were found. */
    svg: string | null
    /** Concrete problems; empty when `svg` is set. */
    problems: string[]
}

/**
 * Prepare one streamed reply for shipping (or for one repair round).
 *
 * `candidate` is kept even when validation fails: a repair prompt has to quote
 * the previous document, and the model needs to see its own broken output next
 * to the problems.
 */
export const prepareIconReply = (reply: string): IconReplyPreparation => {
    const extracted = extractIconSvg(reply ?? '')
    if (!extracted) {
        return {
            candidate: null,
            svg: null,
            problems: ['没有找到完整的 SVG 文档（模型必须输出 <svg>…</svg>，不要解释文字）'],
        }
    }
    const candidate = sanitizeIconSvg(extracted)
    const problems = validateIconSvg(candidate)
    return { candidate, svg: problems.length ? null : candidate, problems }
}

/* ------------------------------------------------------------------ *
 * Design loop — streamed model call in, validated SVG out
 * ------------------------------------------------------------------ */

/** Caller-injected stream: the tool layer passes `streamKnowledgeText`. */
export type AiIconStream = (
    prompt: string,
    options: { system: string; signal: AbortSignal },
) => AsyncGenerator<string>

export type AiIconStage = 'designing' | 'validating' | 'repairing'

export interface AiIconProgress {
    /** What the run is doing right now. */
    stage: AiIconStage
    /** 1-based round: 1 is the initial design, 2+ are repair rounds. */
    round: number
    /** Characters streamed so far in the current round. */
    chars: number
}

export interface AiIconDesignInput extends AiIconPromptInput {
    /** The model call, injected so this module stays import-free/testable. */
    stream: AiIconStream
    /** Caller cancellation (dialog closed). Forwarded to the injected stream. */
    signal?: AbortSignal
    /** Wall-clock budget for the whole run. Defaults to `AI_ICON_TIMEOUT_MS`. */
    timeoutMs?: number
    /** Reply size cap. Defaults to `AI_ICON_MAX_CHARS`. */
    maxChars?: number
    /** Stage/progress callback for the UI. */
    onProgress?: (progress: AiIconProgress) => void
}

export interface AiIconDesignResult {
    /** The validated, shippable SVG document. */
    svg: string
    /** Rounds used (1 = first try, 2 = one repair, …). */
    rounds: number
    /** Characters streamed for the accepted round. */
    chars: number
}

/** The run exceeded the wall-clock budget. */
export class AiIconTimeoutError extends Error {
    constructor(message = 'AI 图标生成超时，请重试或改用离线生成器') {
        super(message)
        this.name = 'AiIconTimeoutError'
    }
}

/** The model answered, but no round produced a shippable SVG (or it was oversized). */
export class AiIconRejectedError extends Error {
    /** Concrete validation problems, ready for the UI and the next repair prompt. */
    readonly problems: string[]

    constructor(problems: readonly string[], message?: string) {
        super(message ?? `AI 生成的图标未通过校验：${problems.join('；')}`)
        this.name = 'AiIconRejectedError'
        this.problems = [...problems]
    }
}

const createAbortError = (): Error => {
    const error = new Error('AI 图标生成已取消')
    error.name = 'AbortError'
    return error
}

const errorNameOf = (error: unknown): string => {
    const name = (error as { name?: unknown } | null)?.name
    return typeof name === 'string' ? name : ''
}

const errorMessageOf = (error: unknown): string => {
    if (typeof error === 'string') return error
    const message = (error as { message?: unknown } | null)?.message
    if (typeof message === 'string') return message
    try {
        return String(error)
    } catch {
        return ''
    }
}

export type IconAiErrorKind =
    | 'cancelled'
    | 'timeout'
    | 'unavailable'
    | 'auth'
    | 'network'
    | 'server'
    | 'invalid'
    | 'unknown'

/**
 * Turn whatever came out of the model transport into a UI decision.
 *
 * The transport in `@kn/common` throws plain `Error`s with text such as
 * `Agent API error (401)` or `Agent API request timed out`, so classification
 * must work on names AND messages rather than on class identity alone. The
 * studio uses this to pick an actionable hint (configure the AI channel, retry,
 * or fall back to the offline generator).
 */
export const classifyIconAiError = (error: unknown): IconAiErrorKind => {
    if (error instanceof AiIconTimeoutError) return 'timeout'
    if (error instanceof AiIconRejectedError) return 'invalid'

    const name = errorNameOf(error)
    const text = `${name} ${errorMessageOf(error)}`.toLowerCase()

    if (name === 'TimeoutError' || /\btimed?\s*out\b|\btimeout\b/.test(text) || text.includes('超时')) return 'timeout'
    if (name === 'AbortError' || name === 'CanceledError' || /\babort(?:ed)?\b|\bcancel(?:l)?ed\b/.test(text) || text.includes('取消')) {
        return 'cancelled'
    }
    if (name === 'AiIconRejectedError' || text.includes('未通过校验') || text.includes('invalid svg')) return 'invalid'
    if (name === 'AgentTransportNotConfiguredError' || /not configured|未配置/.test(text)) return 'unavailable'
    if (/\b(?:401|403)\b/.test(text) || /unauthorized|forbidden|invalid api key|鉴权|认证失败|密钥/.test(text)) return 'auth'
    if (/\b(?:429|5\d\d)\b/.test(text) || /internal server error|bad gateway|service unavailable|gateway timeout|服务器错误/.test(text)) {
        return 'server'
    }
    if (/failed to fetch|fetch failed|network|econn(?:refused|reset)|enotfound|socket hang up|断网|网络/.test(text)) return 'network'
    if (/unavailable|not available|不可用/.test(text)) return 'unavailable'
    return 'unknown'
}

/**
 * Run the design loop: one initial round plus `AI_ICON_REPAIR_ROUNDS` repairs.
 *
 * The caller injects the stream so this module stays import-free and testable.
 * The local `AbortController` is the single cancellation source:
 *  - the caller's `signal` is forwarded to it (dialog closed → AbortError);
 *  - the wall-clock timeout aborts it (`AiIconTimeoutError`);
 *  - it is ALWAYS aborted in `finally`, including after success or a rejected
 *    document, so a backend run is never orphaned.
 */
export const designAiIcon = async (input: AiIconDesignInput): Promise<AiIconDesignResult> => {
    const maxChars = input.maxChars ?? AI_ICON_MAX_CHARS
    const timeoutMs = Math.max(1, input.timeoutMs ?? AI_ICON_TIMEOUT_MS)
    const roundsBudget = 1 + AI_ICON_REPAIR_ROUNDS

    const controller = new AbortController()
    const forwardAbort = (): void => controller.abort()
    if (input.signal) {
        if (input.signal.aborted) controller.abort()
        else input.signal.addEventListener('abort', forwardAbort)
    }

    let timedOut = false
    let timer: ReturnType<typeof setTimeout> | undefined
    // Rejected by the same abort that cancels the stream, so the timeout holds
    // even if the backend ignores its signal.
    const abortPromise = new Promise<never>((_resolve, reject) => {
        const onAbort = (): void => reject(createAbortError())
        if (controller.signal.aborted) onAbort()
        else controller.signal.addEventListener('abort', onAbort, { once: true })
    })
    abortPromise.catch(() => undefined)

    const reportProgress = (stage: AiIconStage, round: number, chars: number): void => {
        try {
            input.onProgress?.({ stage, round, chars })
        } catch {
            // A UI callback must never break the run.
        }
    }
    const assertAlive = (): void => {
        if (timedOut) throw new AiIconTimeoutError()
        if (input.signal?.aborted) throw createAbortError()
    }

    let prompt = buildAiIconPrompt(input)
    let previous: string | null = null
    let lastProblems: string[] = []

    try {
        timer = setTimeout(() => {
            timedOut = true
            controller.abort()
        }, timeoutMs)

        for (let round = 1; round <= roundsBudget; round += 1) {
            assertAlive()
            const stage: AiIconStage = round === 1 ? 'designing' : 'repairing'
            reportProgress(stage, round, 0)
            const stream = input.stream(prompt, { system: AI_ICON_SYSTEM_PROMPT, signal: controller.signal })
            let reply = ''
            try {
                const iterator = stream[Symbol.asyncIterator]()
                for (;;) {
                    const nextPromise = iterator.next()
                    // If the race below rejects first, the abandoned promise
                    // must not surface as an unhandled rejection.
                    nextPromise.catch(() => undefined)
                    const next = await Promise.race([nextPromise, abortPromise])
                    if (next.done) break
                    const chunk = typeof next.value === 'string' ? next.value : ''
                    reply += chunk
                    reportProgress(stage, round, reply.length)
                    if (reply.length > maxChars) {
                        throw new AiIconRejectedError([`模型输出超过 ${maxChars} 字符上限`])
                    }
                }
            } catch (error) {
                if (error instanceof AiIconRejectedError) throw error
                if (timedOut) throw new AiIconTimeoutError()
                if (input.signal?.aborted) throw createAbortError()
                throw error
            }

            assertAlive()
            reportProgress('validating', round, reply.length)
            const prepared = prepareIconReply(reply)
            if (prepared.svg) return { svg: prepared.svg, rounds: round, chars: reply.length }

            previous = prepared.candidate ?? reply.slice(0, 12_000)
            lastProblems = prepared.problems
            prompt = buildAiIconRepairPrompt(previous, lastProblems, round)
        }

        throw new AiIconRejectedError(lastProblems)
    } finally {
        if (timer !== undefined) clearTimeout(timer)
        input.signal?.removeEventListener('abort', forwardAbort)
        // Never leave a backend run alive: success, invalid output and oversized
        // replies all end here.
        controller.abort()
    }
}