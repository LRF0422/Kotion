/**
 * AI icon pipeline test.
 *
 * Everything between a streamed model reply and a project file: the prompts
 * that steer the model, the extractor that pulls the SVG out of prose or
 * ```svg fences, and the validator that decides whether the document is safe
 * to ship. The validator is the last line of defence — an invalid SVG renders
 * as a broken image in the studio preview and the marketplace (the
 * nested-double-quote incident `./icon-art` documents), and scripts or external
 * references would be a security problem the moment the file is opened.
 *
 * Run: node packages/plugin-plugin-studio/src/icons/icon-ai.test.mjs
 */
import {
    AI_ICON_MAX_CHARS,
    AI_ICON_SYSTEM_PROMPT,
    buildAiIconPrompt,
    buildAiIconRepairPrompt,
    extractIconSvg,
    validateIconSvg,
} from './icon-ai.ts'
import { renderPluginIconSvg } from './icon-art.ts'

const results = []
const check = (name, condition, detail = '') => {
    results.push({ name, ok: Boolean(condition), detail })
    console.log(`${condition ? 'ok  ' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`)
}

/* A realistic model artwork: gradient tile, glyph-like shapes, well over the
 * "too short" threshold, every attribute single-quoted. */
const aiArtwork = [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">',
    '  <defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6366f1"/><stop offset="1" stop-color="#4338ca"/></linearGradient></defs>',
    '  <rect width="512" height="512" rx="112" fill="url(#bg)"/>',
    '  <circle cx="256" cy="256" r="96" fill="#ffffff" fill-opacity="0.92"/>',
    '  <path d="M256 196v120M196 256h120" stroke="#4338ca" stroke-width="28" stroke-linecap="round"/>',
    '</svg>',
].join('\n')

/* ------------------------------------------------------------------ *
 * Prompts
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
        && AI_ICON_SYSTEM_PROMPT.includes('&amp;'),
)
check('limits: the reply cap leaves room for a real artwork', AI_ICON_MAX_CHARS >= aiArtwork.length * 10)
check(
    'repair: restates every problem and the previous output',
    (() => {
        const prompt = buildAiIconRepairPrompt(aiArtwork, ['缺少 viewBox 或 width/height', '包含未转义的 &（应写成 &amp;）'])
        return prompt.includes('缺少 viewBox 或 width/height')
            && prompt.includes('包含未转义的 &（应写成 &amp;）')
            && prompt.includes(aiArtwork)
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
 * Validation — what may be written into a project
 * ------------------------------------------------------------------ */
check(
    'validate: the deterministic renderer output passes clean',
    validateIconSvg(renderPluginIconSvg({ seed: 'gitlab' }).svg).length === 0,
    validateIconSvg(renderPluginIconSvg({ seed: 'gitlab' }).svg).join('；'),
)
check('validate: a realistic model artwork passes clean', validateIconSvg(aiArtwork).length === 0, validateIconSvg(aiArtwork).join('；'))
check(
    'validate: flags the historical nested-quote document',
    validateIconSvg(aiArtwork.replace('viewBox="0 0 512 512"', 'font-family=""Apple Color Emoji", sans-serif" viewBox="0 0 512 512"')).some(
        (problem) => problem.includes('嵌套'),
    ),
)
check(
    'validate: flags a raw ampersand but not entities',
    validateIconSvg(aiArtwork.replace('<rect', '<desc>Tom & Jerry</desc><rect')).some((problem) => problem.includes('未转义'))
        && !validateIconSvg(aiArtwork.replace('<rect', '<desc>Tom &amp; Jerry</desc><rect')).some((problem) => problem.includes('未转义')),
)
check(
    'validate: rejects scripts and external references',
    validateIconSvg(aiArtwork.replace('<rect', '<script>alert(1)</script><rect')).some((problem) => problem.includes('外部引用'))
        && validateIconSvg(aiArtwork.replace('<rect', '<image href="https://cdn.example.com/a.png"/><rect')).some((problem) =>
            problem.includes('外部引用'),
        ),
)
check(
    'validate: rejects a stub and a frameless document',
    validateIconSvg('<svg xmlns="http://www.w3.org/2000/svg"></svg>').length >= 2
        && validateIconSvg(aiArtwork.replace('viewBox="0 0 512 512" width="512" height="512"', '')).some((problem) =>
            problem.includes('viewBox'),
        )
        && validateIconSvg(aiArtwork.replace('xmlns="http://www.w3.org/2000/svg"', '')).some((problem) => problem.includes('xmlns')),
)

const failedChecks = results.filter((entry) => !entry.ok)
console.log(`\n${results.length - failedChecks.length}/${results.length} checks passed`)
process.exit(failedChecks.length ? 1 : 0)
