/**
 * AI icon pipeline test.
 *
 * Everything between a streamed model reply and a project file: the prompts
 * that steer the model, the extractor that pulls the SVG out of prose or
 * ```svg fences, the sanitizer that fixes safe slips, the hand-written strict
 * XML scanner, the security rules, and the design / repair loop with its
 * timeout, cancel and error-classification contract.
 *
 * The validator is the last line of defence — an invalid SVG renders as a
 * broken image in the studio preview and the marketplace (the
 * nested-double-quote incident `./icon-art` documents), and scripts or external
 * references would be a security problem the moment the file is opened.
 *
 * Run: node packages/plugin-plugin-studio/src/icons/icon-ai.test.mjs
 */
import {
    AI_ICON_MAX_CHARS,
    AI_ICON_REPAIR_ROUNDS,
    AI_ICON_SYSTEM_PROMPT,
    AI_ICON_TIMEOUT_MS,
    AiIconRejectedError,
    AiIconTimeoutError,
    buildAiIconPrompt,
    buildAiIconRepairPrompt,
    classifyIconAiError,
    designAiIcon,
    extractIconSvg,
    prepareIconReply,
    sanitizeIconSvg,
    validateIconSvg,
} from './icon-ai.ts'
import { renderPluginIconSvg } from './icon-art.ts'

const results = []
const check = (name, condition, detail = '') => {
    results.push({ name, ok: Boolean(condition), detail })
    console.log(`${condition ? 'ok  ' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`)
}

/* A realistic model artwork: gradient tile, glyph-like shapes, well over the
 * "too short" threshold, every attribute double-quoted. */
const aiArtwork = [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">',
    '  <defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6366f1"/><stop offset="1" stop-color="#4338ca"/></linearGradient></defs>',
    '  <rect width="512" height="512" rx="112" fill="url(#bg)"/>',
    '  <circle cx="256" cy="256" r="96" fill="#ffffff" fill-opacity="0.92"/>',
    '  <path d="M256 196v120M196 256h120" stroke="#4338ca" stroke-width="28" stroke-linecap="round"/>',
    '</svg>',
].join('\n')

const withoutXmlns = aiArtwork.replace(' xmlns="http://www.w3.org/2000/svg"', '')
const withMarkup = (markup) => aiArtwork.replace('<rect', `${markup}<rect`)
const frameless = aiArtwork.replace('viewBox="0 0 512 512" width="512" height="512"', '')
const abortLikeError = () => {
    const error = new Error('aborted')
    error.name = 'AbortError'
    return error
}

/* ------------------------------------------------------------------ *
 * Prompts and budgets
 * ------------------------------------------------------------------ */
check(
    'prompt: names the plugin and carries the author brief',
    (() => {
        const prompt = buildAiIconPrompt({ seed: 'word-count', title: 'Word Count', brief: '复古钢笔，纸张质感' })
        return prompt.includes('Word Count') && prompt.includes('word-count') && prompt.includes('复古钢笔')
    })(),
)
check(
    'prompt: falls back to the seed and omits an empty brief',
    (() => {
        const prompt = buildAiIconPrompt({ seed: 'my-plugin', brief: '   ' })
        return prompt.includes('my-plugin') && !prompt.includes('设计要求')
    })(),
)
check(
    'system: pins the canvas, the no-fence rule and the XML safety rules',
    AI_ICON_SYSTEM_PROMPT.includes('512')
        && AI_ICON_SYSTEM_PROMPT.includes('Markdown')
        && AI_ICON_SYSTEM_PROMPT.includes('&amp;')
        && AI_ICON_SYSTEM_PROMPT.includes('自检'),
)
check('limits: the reply cap leaves room for a real artwork', AI_ICON_MAX_CHARS >= aiArtwork.length * 10)
check(
    'budgets: the timeout and repair budget are the documented defaults',
    AI_ICON_TIMEOUT_MS === 120_000 && AI_ICON_REPAIR_ROUNDS === 2,
)
check(
    'repair: restates every problem, the previous output and the attempt',
    (() => {
        const prompt = buildAiIconRepairPrompt(aiArtwork, ['缺少 viewBox 或 width/height', '包含未转义的 &（应写成 &amp;）'], 2)
        return prompt.includes('缺少 viewBox 或 width/height')
            && prompt.includes('包含未转义的 &（应写成 &amp;）')
            && prompt.includes(aiArtwork)
            && prompt.includes('第 2 轮修复')
            && prompt.includes('只重新输出')
    })(),
)

/* ------------------------------------------------------------------ *
 * Extraction
 * ------------------------------------------------------------------ */
check(
    'extract: pulls the SVG out of a fenced reply',
    extractIconSvg(`好的，这是设计：\n\n\`\`\`svg\n${aiArtwork}\n\`\`\`\n\n希望你喜欢。`) === aiArtwork,
)
check(
    'extract: spans from the first <svg to the last </svg>',
    (() => {
        const picked = extractIconSvg(`草稿：${aiArtwork}\n最终：${aiArtwork}`)
        return picked.startsWith('<svg') && picked.endsWith('</svg>') && picked.length > aiArtwork.length
    })(),
)
check(
    'extract: null when the reply has no complete SVG',
    extractIconSvg('抱歉，我无法完成。') === null
        && extractIconSvg('') === null
        && extractIconSvg('<svg xmlns="http://www.w3.org/2000/svg">') === null,
)

/* ------------------------------------------------------------------ *
 * Sanitization — safe auto-fixes only
 * ------------------------------------------------------------------ */
check(
    'sanitize: drops an XML declaration and leading prose',
    sanitizeIconSvg('<?xml version="1.0" encoding="UTF-8"?>\n' + aiArtwork) === aiArtwork
        && sanitizeIconSvg('好的，这是图标：\n' + aiArtwork) === aiArtwork,
)
check(
    'sanitize: escapes a bare & and the result validates clean',
    (() => {
        const fixed = sanitizeIconSvg(withMarkup('<desc>Tom & Jerry</desc>'))
        return fixed.includes('Tom &amp; Jerry') && validateIconSvg(fixed).length === 0
    })(),
    validateIconSvg(sanitizeIconSvg(withMarkup('<desc>Tom & Jerry</desc>'))).join('；'),
)
check(
    'sanitize: injects the missing default namespace',
    (() => {
        const fixed = sanitizeIconSvg(withoutXmlns)
        return fixed.includes('xmlns="http://www.w3.org/2000/svg"') && validateIconSvg(fixed).length === 0
    })(),
)
check('sanitize: normalizes CRLF', sanitizeIconSvg(aiArtwork.replace(/\n/g, '\r\n')) === aiArtwork)
check(
    'sanitize: keeps unsafe markup for the validator to reject',
    (() => {
        const fixed = sanitizeIconSvg(withMarkup('<script>alert(1)</script>'))
        return fixed.includes('<script') && validateIconSvg(fixed).some((problem) => problem.includes('外部引用'))
    })(),
)
check(
    'sanitize: does not escape & inside CDATA',
    (() => {
        const fixed = sanitizeIconSvg(
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><![CDATA[Tom & Jerry]]><rect width="512" height="512"/></svg>',
        )
        return fixed.includes('Tom & Jerry') && !fixed.includes('Tom &amp; Jerry')
    })(),
)
check(
    'sanitize: is idempotent on a realistic artwork and on the deterministic renderer',
    sanitizeIconSvg(aiArtwork) === aiArtwork
        && sanitizeIconSvg(renderPluginIconSvg({ seed: 'gitlab' }).svg) === renderPluginIconSvg({ seed: 'gitlab' }).svg.trim(),
)

/* ------------------------------------------------------------------ *
 * Strict XML well-formedness scan
 * ------------------------------------------------------------------ */
check(
    'xml: flags a missing closing tag',
    validateIconSvg(aiArtwork.replace('</svg>', '')).some((problem) => problem.includes('未闭合')),
    validateIconSvg(aiArtwork.replace('</svg>', '')).join('；'),
)
check(
    'xml: flags an opening tag that never closes',
    validateIconSvg(aiArtwork.replace('<rect width="512" height="512" rx="112" fill="url(#bg)"/>', '<rect width="512"')).some(
        (problem) => problem.includes('未闭合'),
    ),
)
check(
    'xml: flags mismatched tags',
    validateIconSvg(aiArtwork.replace('</svg>', '</g></svg>')).some((problem) => problem.includes('不匹配')),
    validateIconSvg(aiArtwork.replace('</svg>', '</g></svg>')).join('；'),
)
check(
    'xml: flags an unquoted attribute value',
    validateIconSvg(aiArtwork.replace('viewBox="0 0 512 512"', 'viewBox=0')).some((problem) => problem.includes('引号')),
)
check(
    'xml: flags < inside an attribute value',
    validateIconSvg(aiArtwork.replace('d="M256 196v120M196 256h120"', 'd="M256 196<v120"')).some((problem) =>
        problem.includes('不能出现 <'),
    ),
)
check(
    'xml: flags invalid named entities',
    validateIconSvg(withMarkup('<desc>Tom &nbsp; Jerry</desc>')).some((problem) => problem.includes('实体引用')),
)
check(
    'xml: flags a raw ampersand but not entities',
    validateIconSvg(withMarkup('<desc>Tom & Jerry</desc>')).some((problem) => problem.includes('未转义'))
        && !validateIconSvg(withMarkup('<desc>Tom &amp; Jerry</desc>')).some((problem) => problem.includes('未转义')),
)
check(
    'xml: flags the historical nested-double-quote document',
    validateIconSvg(
        aiArtwork.replace('viewBox="0 0 512 512"', 'font-family=""Apple Color Emoji", sans-serif" viewBox="0 0 512 512"'),
    ).some((problem) => problem.includes('嵌套')),
)
check(
    'xml: rejects DOCTYPE',
    validateIconSvg(
        '<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">\n' + aiArtwork,
    ).some((problem) => problem.includes('DOCTYPE')),
)
check(
    'xml: rejects a second root element',
    validateIconSvg(`${aiArtwork}\n${aiArtwork}`).some((problem) => problem.includes('多个根元素')),
)
check(
    'xml: rejects text outside the root element',
    validateIconSvg(`${aiArtwork}stray text`).some((problem) => problem.includes('之外')),
)
check(
    'xml: accepts comments and CDATA',
    validateIconSvg(withMarkup('<!-- decorative tile --><![CDATA[internal & raw]]>')).length === 0,
    validateIconSvg(withMarkup('<!-- decorative tile --><![CDATA[internal & raw]]>')).join('；'),
)
check(
    'xml: rejects processing instructions inside the document',
    validateIconSvg(withMarkup('<?design note?>')).some((problem) => problem.includes('处理指令'))
        && validateIconSvg(`${aiArtwork}<?design note?>`).some((problem) => problem.includes('处理指令')),
)
check(
    'xml: a leading XML declaration is legal (and sanitized away before shipping)',
    (() => {
        const declared = '<?xml version="1.0" encoding="UTF-8"?>\n' + aiArtwork
        return validateIconSvg(declared).length === 0
            && sanitizeIconSvg(declared) === aiArtwork
            && prepareIconReply(declared).svg === aiArtwork
    })(),
    validateIconSvg('<?xml version="1.0" encoding="UTF-8"?>\n' + aiArtwork).join('；'),
)
check(
    'xml: an undeclared namespace prefix is rejected',
    validateIconSvg(withMarkup('<use xlink:href="#bg"/>')).some((problem) => problem.includes('命名空间前缀')),
    validateIconSvg(withMarkup('<use xlink:href="#bg"/>')).join('；'),
)
check(
    'xml: accepts namespace-prefixed names once xmlns:xlink is declared',
    (() => {
        const declared = aiArtwork.replace(
            'viewBox="0 0 512 512"',
            'xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 512 512"',
        )
        return validateIconSvg(declared.replace('<rect', '<use xlink:href="#bg"/><rect')).length === 0
    })(),
)
check(
    'xml: self-closing tags and quoted values pass',
    validateIconSvg(aiArtwork).length === 0 && validateIconSvg(aiArtwork.replace('height="512">', "height='512'>")).length === 0,
)

/* ------------------------------------------------------------------ *
 * Security rules
 * ------------------------------------------------------------------ */
check(
    'security: rejects <script>',
    validateIconSvg(withMarkup('<script>alert(1)</script>')).some((problem) => problem.includes('script')),
)
check(
    'security: rejects <style>',
    validateIconSvg(withMarkup('<style>rect{fill:red}</style>')).some((problem) => problem.includes('style')),
)
check(
    'security: rejects <foreignObject>',
    validateIconSvg(withMarkup('<foreignObject><div>hi</div></foreignObject>')).some((problem) =>
        problem.includes('foreignObject'),
    ),
)
check(
    'security: rejects <image> and external hrefs',
    validateIconSvg(withMarkup('<image href="https://cdn.example.com/a.png"/>')).some((problem) =>
        problem.includes('外部引用'),
    )
        && validateIconSvg(withMarkup('<use href="https://cdn.example.com/a.svg"/>')).some((problem) =>
            problem.includes('href'),
        )
        && validateIconSvg(withMarkup('<use href="file:///etc/passwd"/>')).some((problem) => problem.includes('href'))
        && validateIconSvg(withMarkup('<use href="data:image/png;base64,AAAA"/>')).some((problem) => problem.includes('href')),
)
check(
    'security: rejects protocol-relative and relative hrefs',
    validateIconSvg(withMarkup('<use href="//evil.example/x.svg"/>')).some((problem) => problem.includes('href'))
        && validateIconSvg(withMarkup('<use xlink:href="foo.png"/>')).some((problem) => problem.includes('href'))
        && validateIconSvg(withMarkup('<use href="../assets/x.svg"/>')).some((problem) => problem.includes('href'))
        && validateIconSvg(withMarkup('<use href="x"/>')).some((problem) => problem.includes('href')),
)
check(
    'security: rejects a stylesheet processing instruction',
    validateIconSvg(
        withMarkup('<?xml-stylesheet type="text/css" href="http://evil.example/x.css"?>'),
    ).some((problem) => problem.includes('外部引用')),
    validateIconSvg(withMarkup('<?xml-stylesheet type="text/css" href="http://evil.example/x.css"?>')).join('；'),
)
check(
    'security: rejects event handler attributes',
    validateIconSvg(withMarkup('<rect onclick="alert(1)"/>')).some((problem) => problem.includes('事件')),
)
check(
    'security: rejects url(...) that is not an in-document #id',
    validateIconSvg(aiArtwork.replace('fill="url(#bg)"', 'fill="url(https://evil.example/x)"')).some((problem) =>
        problem.includes('url('),
    ),
)
check(
    'security: rejects javascript: and @import',
    validateIconSvg(withMarkup('<use href="javascript:alert(1)"/>')).some((problem) => problem.includes('javascript'))
        && validateIconSvg(withMarkup('<style>@import url(https://evil.example/x.css);</style>')).some(
            (problem) => problem.includes('@import') || problem.includes('<style>'),
        ),
)
check(
    'security: rejects animation elements',
    validateIconSvg(withMarkup('<animate attributeName="x" dur="1s"/>')).some((problem) => problem.includes('animate'))
        && validateIconSvg(withMarkup('<set attributeName="fill" to="#fff"/>')).some((problem) => problem.includes('<set')),
)
check(
    'security: allows internal references (url(#id), href="#id")',
    validateIconSvg(aiArtwork).length === 0
        && !validateIconSvg(aiArtwork).some((problem) => problem.includes('外部引用'))
        && validateIconSvg(
            aiArtwork
                .replace('viewBox="0 0 512 512"', 'xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 512 512"')
                .replace('<rect', '<use xlink:href="#bg"/><rect'),
        ).length === 0,
)

check(
    'security: encoded url()/href cannot smuggle an external reference past the scan',
    [
        aiArtwork.replace('fill="url(#bg)"', 'fill="u&#114;l(http://evil.example/x.svg)"'),
        aiArtwork.replace('fill="url(#bg)"', 'fill="&#x75;rl(data:image/svg+xml;base64,AAAA)"'),
        aiArtwork.replace('fill="url(#bg)"', 'fill="u\\72l(http://evil.example/x.svg)"'),
        aiArtwork.replace('fill="url(#bg)"', 'style="fill:u&#114;l(http://evil.example/x.svg)"'),
        withMarkup('<use href="&#104;ttp://evil.example/x.svg"/>'),
        withMarkup('<use href="&#x68;ttps://evil.example/x.svg"/>'),
    ].every((doc) => validateIconSvg(doc).some((problem) => problem.includes('外部引用'))),
)
check(
    'security: href is a URL, not CSS (backslash escapes are NOT decoded there)',
    validateIconSvg(withMarkup('<use href="\\23 x"/>')).some((problem) => problem.includes('href')),
)
check(
    'xml: <? inside comments/CDATA is inert text, not a processing instruction',
    validateIconSvg(withMarkup('<!-- <? --><![CDATA[ <? echo ?> ]]>')).length === 0,
    validateIconSvg(withMarkup('<!-- <? --><![CDATA[ <? echo ?> ]]>')).join('；'),
)
check(
    'xml: literal XML control characters are rejected in text and attributes',
    validateIconSvg(withMarkup('<desc>bad\u0001char</desc>')).some((problem) => problem.includes('控制字符'))
        && validateIconSvg(
            aiArtwork.replace('fill="url(#bg)"', 'fill="#fff" data-x="a\u0001b"'),
        ).some((problem) => problem.includes('控制字符')),
)
check(
    'xml: a prefix declared on a nested element does not leak to its siblings',
    validateIconSvg(
        withMarkup(
            '<g xmlns:xlink="http://www.w3.org/1999/xlink"><use xlink:href="#bg"/></g>'
                + '<use xlink:href="#bg"/>',
        ),
    ).some((problem) => problem.includes('命名空间前缀'))
        && validateIconSvg(
            withMarkup(
                '<g xmlns:xlink="http://www.w3.org/1999/xlink"><use xlink:href="#bg"/></g>',
            ),
        ).length === 0,
)
check(
    'xml: malformed namespace declaration names are rejected',
    validateIconSvg(withMarkup('<rect xmlns:x:y="urn"/>')).some((problem) => problem.includes('冒号'))
        && validateIconSvg(withMarkup('<rect xmlns:xmlns="urn"/>')).some((problem) => problem.includes('保留')),
)
check(
    'xml: the reserved xml prefix cannot be rebound to another URI',
    validateIconSvg(
        withMarkup('<rect xmlns:xml="http://evil.example/xml"/>'),
    ).some((problem) => problem.includes('保留前缀'))
        && validateIconSvg(
            withMarkup('<rect xmlns:xml="http://www.w3.org/XML/1998/namespace"/>'),
        ).length === 0,
)
check(
    'xml: control characters inside comments/CDATA are rejected too',
    validateIconSvg(withMarkup('<!-- bad\u0001comment -->')).some((problem) => problem.includes('控制字符'))
        && validateIconSvg(withMarkup('<![CDATA[bad\u0001cdata]]>')).some((problem) => problem.includes('控制字符')),
)
check(
    'xml: a multi-colon QName is rejected',
    validateIconSvg(withMarkup('<x:y:script xmlns:x="u"/>')).some((problem) => problem.includes('QName'))
        && validateIconSvg(withMarkup('<rect x:y:fill="#fff"/>')).some((problem) => problem.includes('QName')),
)
check(
    'security: prose and comments containing URL-ish text are not false positives',
    validateIconSvg(withMarkup('<desc>see url(http://example.com/docs)</desc>')).length === 0
        && validateIconSvg(withMarkup('<!-- example: <script>alert(1)</script> -->')).length === 0,
)
check(
    'security: unicode fragment ids are accepted',
    validateIconSvg(
        aiArtwork.replace('id="bg"', 'id="渐变"').replace('url(#bg)', 'url(#渐变)'),
    ).length === 0,
)
check(
    'xml: duplicate attributes are rejected',
    validateIconSvg(aiArtwork.replace('fill="url(#bg)"', 'fill="url(#bg)" fill="#000"')).some((problem) =>
        problem.includes('重复'),
    ),
)
check(
    'xml: invalid character references are rejected',
    validateIconSvg(aiArtwork.replace('fill="url(#bg)"', 'fill="#fff" data-x="&#0;"')).some((problem) =>
        problem.includes('字符引用'),
    )
        && validateIconSvg(aiArtwork.replace('fill="url(#bg)"', 'fill="#fff" data-x="&#xD800;"')).some((problem) =>
            problem.includes('字符引用'),
        ),
)

/* ------------------------------------------------------------------ *
 * Root, size and drawing requirements
 * ------------------------------------------------------------------ */
check(
    'validate: the deterministic renderer output passes clean',
    validateIconSvg(renderPluginIconSvg({ seed: 'gitlab' }).svg).length === 0,
    validateIconSvg(renderPluginIconSvg({ seed: 'gitlab' }).svg).join('；'),
)
check(
    'validate: URL-ish text in the renderer title is not a false positive',
    validateIconSvg(renderPluginIconSvg({ seed: '(paren)', title: 'url(http://example.com) 图标' }).svg).length === 0,
    validateIconSvg(renderPluginIconSvg({ seed: '(paren)', title: 'url(http://example.com) 图标' }).svg).join('；'),
)
check(
    'validate: a bare <g> is not treated as a drawing primitive',
    validateIconSvg(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><g></g><!-- '
            + 'filler '.repeat(40)
            + '--></svg>',
    ).some((problem) => problem.includes('图形')),
)
check(
    'validate: a primitive that only exists inside a comment does not count',
    validateIconSvg(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">'
            + '<!-- <rect width="512" height="512"/> ' + 'filler '.repeat(40) + '--></svg>',
    ).some((problem) => problem.includes('图形')),
)
check('validate: a realistic model artwork passes clean', validateIconSvg(aiArtwork).length === 0, validateIconSvg(aiArtwork).join('；'))
check(
    'validate: width+height is accepted instead of viewBox',
    validateIconSvg(aiArtwork.replace('viewBox="0 0 512 512"', '')).length === 0,
    validateIconSvg(aiArtwork.replace('viewBox="0 0 512 512"', '')).join('；'),
)
check(
    'validate: missing xmlns is flagged',
    validateIconSvg(withoutXmlns).some((problem) => problem.includes('xmlns')),
)
check(
    'validate: missing viewBox/width/height is flagged',
    validateIconSvg(frameless).some((problem) => problem.includes('viewBox')),
)
check(
    'validate: data-xmlns does not satisfy the namespace requirement',
    validateIconSvg(
        aiArtwork.replace('xmlns="http://www.w3.org/2000/svg"', 'data-xmlns="http://www.w3.org/2000/svg"'),
    ).some((problem) => problem.includes('xmlns')),
)
check(
    'sanitize: data-xmlns still gets a real xmlns injected',
    sanitizeIconSvg(
        aiArtwork.replace('xmlns="http://www.w3.org/2000/svg"', 'data-xmlns="http://www.w3.org/2000/svg"'),
    ).includes(' xmlns="http://www.w3.org/2000/svg"'),
)
check(
    'validate: data-viewBox/data-width do not satisfy the canvas requirement',
    validateIconSvg(
        aiArtwork.replace(
            'viewBox="0 0 512 512" width="512" height="512"',
            'data-viewBox="0 0 512 512" data-width="512" data-height="512"',
        ),
    ).some((problem) => problem.includes('viewBox')),
)
check(
    'validate: a stub is too short and frameless',
    validateIconSvg('<svg xmlns="http://www.w3.org/2000/svg"></svg>').length >= 2,
)
check(
    'validate: a long document without a drawing primitive is flagged',
    validateIconSvg(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><desc>' + 'x'.repeat(300) + '</desc></svg>',
    ).some((problem) => problem.includes('图形')),
)
check(
    'validate: an oversized document is flagged',
    validateIconSvg(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><desc>' + 'x'.repeat(200_100) + '</desc></svg>',
    ).some((problem) => problem.includes('过长')),
)
check(
    'validate: a non-svg root is flagged',
    validateIconSvg('<html><rect/></html>').some((problem) => problem.includes('不是以 <svg')),
)

/* ------------------------------------------------------------------ *
 * prepareIconReply — extract → sanitize → validate
 * ------------------------------------------------------------------ */
check(
    'prepare: a valid reply becomes the shippable svg',
    (() => {
        const prepared = prepareIconReply(aiArtwork)
        return prepared.svg === aiArtwork && prepared.candidate === aiArtwork && prepared.problems.length === 0
    })(),
)
check(
    'prepare: extracts from a fenced reply',
    prepareIconReply(`这是设计：\n\n\`\`\`svg\n${aiArtwork}\n\`\`\`\n`)?.svg === aiArtwork,
)
check(
    'prepare: a safe mistake (missing xmlns) is fixed before validation',
    (() => {
        const prepared = prepareIconReply(withoutXmlns)
        return prepared.svg !== null && prepared.svg.includes('xmlns="http://www.w3.org/2000/svg"') && prepared.problems.length === 0
    })(),
)
check(
    'prepare: keeps the candidate even when validation fails',
    (() => {
        const prepared = prepareIconReply(withMarkup('<script>alert(1)</script>'))
        return prepared.candidate !== null
            && prepared.candidate.includes('<script')
            && prepared.svg === null
            && prepared.problems.length > 0
    })(),
    JSON.stringify(prepareIconReply(withMarkup('<script>alert(1)</script>')).problems),
)
check(
    'prepare: a reply without a complete SVG has no candidate',
    (() => {
        const prepared = prepareIconReply('抱歉，我无法完成。')
        return prepared.candidate === null && prepared.svg === null && prepared.problems.length > 0
    })(),
)

/* ------------------------------------------------------------------ *
 * designAiIcon — rounds, timeout, cancel, progress
 * ------------------------------------------------------------------ */
const recordingStream = (replies) => {
    const calls = []
    const signals = []
    const stream = async function* (prompt, options) {
        calls.push({ prompt, options })
        signals.push(options.signal)
        yield replies[Math.min(calls.length - 1, replies.length - 1)]
    }
    return { calls, signals, stream }
}

const waitingStream = (signals) => async function* (_prompt, options) {
    signals.push(options.signal)
    yield '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">'
    await new Promise((_resolve, reject) => {
        if (options.signal.aborted) {
            reject(abortLikeError())
            return
        }
        options.signal.addEventListener('abort', () => reject(abortLikeError()), { once: true })
    })
}

{
    const recorder = recordingStream([aiArtwork])
    const stages = []
    const result = await designAiIcon({
        seed: 'word-count',
        title: 'Word Count',
        brief: '复古钢笔',
        stream: recorder.stream,
        onProgress: (progress) => stages.push(progress),
    })
    check(
        'design: happy path returns the validated artwork',
        result.svg === aiArtwork && result.rounds === 1 && result.chars === aiArtwork.length,
        JSON.stringify({ rounds: result.rounds, chars: result.chars }),
    )
    check(
        'design: passes the system prompt and the design brief',
        recorder.calls.length === 1
            && recorder.calls[0].options.system === AI_ICON_SYSTEM_PROMPT
            && recorder.calls[0].prompt.includes('Word Count')
            && recorder.calls[0].prompt.includes('复古钢笔'),
    )
    check(
        'design: progress reports designing then validating',
        stages.some((progress) => progress.stage === 'designing')
            && stages.some((progress) => progress.stage === 'validating')
            && stages.every((progress) => progress.round === 1),
    )
    check('design: the local run is aborted after success', recorder.signals[0].aborted === true)
}

{
    const broken = withMarkup('<script>alert(1)</script>')
    const recorder = recordingStream([broken, aiArtwork])
    const stages = []
    const result = await designAiIcon({ seed: 'repair', stream: recorder.stream, onProgress: (progress) => stages.push(progress) })
    check(
        'design: a broken first reply gets one repair round',
        result.rounds === 2 && result.svg === aiArtwork && recorder.calls.length === 2,
        JSON.stringify({ rounds: result.rounds, calls: recorder.calls.length }),
    )
    check(
        'design: the repair prompt quotes the candidate and the concrete problems',
        recorder.calls[1].prompt.includes('外部引用')
            && recorder.calls[1].prompt.includes('alert(1)')
            && recorder.calls[1].prompt.includes('第 1 轮修复'),
    )
    check(
        'design: progress reports repairing for round 2',
        stages.some((progress) => progress.stage === 'repairing' && progress.round === 2)
            && stages.filter((progress) => progress.stage === 'validating').length === 2,
    )
}

{
    const recorder = recordingStream([frameless])
    let rejection = null
    try {
        await designAiIcon({ seed: 'still-broken', stream: recorder.stream })
    } catch (error) {
        rejection = error
    }
    check(
        'design: exhausts the repair budget and rejects with the problems',
        rejection instanceof AiIconRejectedError
            && rejection.problems.some((problem) => problem.includes('viewBox'))
            && recorder.calls.length === 1 + AI_ICON_REPAIR_ROUNDS,
        `${recorder.calls.length} attempts; ${JSON.stringify(rejection?.problems)}`,
    )
}

{
    const recorder = recordingStream([`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${'x'.repeat(400)}`])
    let rejection = null
    try {
        await designAiIcon({ seed: 'too-big', stream: recorder.stream, maxChars: 120 })
    } catch (error) {
        rejection = error
    }
    check(
        'design: an oversized reply is rejected and the run aborted',
        rejection instanceof AiIconRejectedError
            && rejection.problems.some((problem) => problem.includes('字符上限'))
            && recorder.signals[0].aborted === true,
    )
}

{
    const signals = []
    const started = Date.now()
    let rejection = null
    try {
        await designAiIcon({ seed: 'slow', stream: waitingStream(signals), timeoutMs: 40 })
    } catch (error) {
        rejection = error
    }
    check(
        'design: a hanging stream hits the wall-clock timeout',
        rejection instanceof AiIconTimeoutError && Date.now() - started >= 25,
        `${Date.now() - started}ms`,
    )
    check('design: the timeout aborts the injected run', signals[0]?.aborted === true)
}

{
    const signals = []
    const controller = new AbortController()
    const run = designAiIcon({ seed: 'cancel', stream: waitingStream(signals), signal: controller.signal, timeoutMs: 5_000 })
    setTimeout(() => controller.abort(), 20)
    let rejection = null
    try {
        await run
    } catch (error) {
        rejection = error
    }
    check(
        'design: external abort surfaces as AbortError and classifies as cancelled',
        rejection?.name === 'AbortError' && classifyIconAiError(rejection) === 'cancelled',
        String(rejection?.name ?? rejection),
    )
    check('design: external abort cancels the injected stream', signals[0]?.aborted === true)
}

{
    const controller = new AbortController()
    controller.abort()
    let calls = 0
    const stream = async function* () {
        calls += 1
        yield aiArtwork
    }
    let rejection = null
    try {
        await designAiIcon({ seed: 'already-cancelled', stream, signal: controller.signal })
    } catch (error) {
        rejection = error
    }
    check(
        'design: an already-aborted caller never starts the stream',
        rejection?.name === 'AbortError' && calls === 0,
        `${String(rejection?.name)}; ${calls} calls`,
    )
}

/* ------------------------------------------------------------------ *
 * Error classification (the transport throws plain Errors)
 * ------------------------------------------------------------------ */
check(
    'classify: timeout',
    classifyIconAiError(new AiIconTimeoutError()) === 'timeout'
        && classifyIconAiError(new Error('Agent API request timed out')) === 'timeout',
)
check(
    'classify: invalid output',
    classifyIconAiError(new AiIconRejectedError(['缺少 viewBox'])) === 'invalid'
        && classifyIconAiError(new Error('AI 生成的图标未通过校验：缺少 viewBox')) === 'invalid',
)
check(
    'classify: unavailable transport',
    classifyIconAiError(
        Object.assign(new Error('AgentTransport is not configured for this host'), { name: 'AgentTransportNotConfiguredError' }),
    ) === 'unavailable'
        && classifyIconAiError(new Error('AgentTransport is not configured')) === 'unavailable',
)
check(
    'classify: auth',
    classifyIconAiError(new Error('Agent API error (401)')) === 'auth'
        && classifyIconAiError(new Error('Agent API error (403)')) === 'auth',
)
check(
    'classify: network',
    classifyIconAiError(new Error('failed to fetch')) === 'network'
        && classifyIconAiError(new Error('fetch failed: ECONNREFUSED')) === 'network',
)
check(
    'classify: server',
    classifyIconAiError(new Error('Agent API error (500)')) === 'server'
        && classifyIconAiError(new Error('Agent API error (429)')) === 'server',
)
check('classify: cancelled', classifyIconAiError(abortLikeError()) === 'cancelled')
check('classify: unknown', classifyIconAiError(new Error('boom')) === 'unknown')

const failedChecks = results.filter((entry) => !entry.ok)
console.log(`\n${results.length - failedChecks.length}/${results.length} checks passed`)
process.exit(failedChecks.length ? 1 : 0)