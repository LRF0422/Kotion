/**
 * AI-designed plugin icons — prompt, extraction and validity rules.
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
 * Everything here is pure: building the prompts, pulling the SVG out of a
 * streamed reply, and judging whether that SVG is safe to ship. The streaming
 * itself, the abort handling and the file writes live in the tool layer.
 *
 * Why the validation is strict: a model reply is untrusted input, and this
 * artwork is rendered through `<img src>` in the studio preview and the
 * marketplace. Invalid XML shows a broken image instead of the icon (the
 * nested-double-quote incident `./icon-art` documents), and scripts or external
 * references would be a security problem the moment the SVG is opened directly.
 */

/** Canvas the model is asked to draw on (the SVG itself scales to anything). */
export const AI_ICON_SIZE = 512

/**
 * Upper bound for one streamed reply. A real 512×512 artwork is a few KB; this
 * only stops a runaway generation from ballooning memory or the run budget.
 */
export const AI_ICON_MAX_CHARS = 48_000

/**
 * System instruction for the icon run. Written as hard rules because the model
 * also writes the SVG source — every constraint here is one that, when broken,
 * produces a broken image, an unloadable asset or a rejected upload.
 */
export const AI_ICON_SYSTEM_PROMPT = [
    '你是资深 App 图标设计师，为 Kotion 知识库应用的插件市场设计插件图标。',
    '必须严格遵守以下规则：',
    `1. 只输出一张完整、合法的 SVG 文档：${AI_ICON_SIZE}×${AI_ICON_SIZE}，viewBox="0 0 ${AI_ICON_SIZE} ${AI_ICON_SIZE}"；不要任何解释文字，不要 Markdown 代码围栏。`,
    '2. 自包含：不引用任何外部资源——禁止 <image>、<script>、<foreignObject>、外链 href、url(http…)、@import。',
    '3. 视觉：现代扁平 App 图标——圆角方形底色（rx≈112）+ 平滑渐变（2–3 个色停）+ 一个居中的图形符号；可以有柔和高光或内阴影，但整体干净克制。',
    '4. 不出现文字、字母、数字或水印；符号用基础图形（rect/circle/path 等）简洁绘制。',
    "5. XML 必须严格合法：属性值内不能嵌套双引号（字体栈用单引号，如 font-family=\"'A', sans-serif\"）；裸 & 必须写成 &amp;。",
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
 * fixes the document instead of re-rolling the dice. One round is the budget —
 * a model that still cannot produce valid XML will not be saved by a third try.
 */
export const buildAiIconRepairPrompt = (previous: string, problems: readonly string[]): string =>
    [
        '你上次输出的 SVG 不满足要求，存在以下问题：',
        ...problems.map((problem) => `- ${problem}`),
        '',
        '上次输出：',
        previous,
        '',
        '请修正全部问题，只重新输出完整的 SVG 文档，不要解释。',
    ].join('\n')

/**
 * Pull the SVG document out of a streamed reply.
 *
 * Replies come wrapped in prose or ```svg fences no matter how the prompt is
 * worded, so the extractor takes the first `<svg` to the last `</svg>` — the
 * longest plausible document — and lets validation judge the contents.
 */
export const extractIconSvg = (text: string): string | null => {
    if (!text) return null
    const start = text.indexOf('<svg')
    const end = text.lastIndexOf('</svg>')
    if (start === -1 || end === -1 || end < start) return null
    return text.slice(start, end + '</svg>'.length).trim()
}

/** A `&` that does not start a valid XML entity. */
const RAW_AMPERSAND = /&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/

/**
 * Nested-quote probe (same shape as the one in `./icon-art`'s tests): after an
 * attribute's closing quote must come whitespace, `/` or `>` — a bare letter
 * means the value swallowed its own closing quote and the document is invalid.
 */
const NESTED_ATTRIBUTE_QUOTES = /[a-zA-Z-]+="[^"]*"[^\s/>]/

/** Tags and reference shapes that make an SVG unsafe or unloadable standalone. */
const EXTERNAL_REFERENCE =
    /<script|<image|<foreignObject|<iframe|javascript:|url\(\s*['"]?https?:|href\s*=\s*['"]https?:|@import/i

/** At least one primitive that actually draws something. */
const DRAWING_PRIMITIVE = /<(path|rect|circle|ellipse|polygon|polyline|line|g)\b/

/**
 * Everything that must hold before an AI-designed SVG may be written into a
 * project. Returns the problems found — empty means safe to ship. Strings are
 * surfaced to the user (and to the model as the repair prompt), so they say
 * what is wrong, not just that something is.
 */
export const validateIconSvg = (svg: string): string[] => {
    const doc = svg?.trim() ?? ''
    const problems: string[] = []

    if (!doc.startsWith('<svg') || !doc.endsWith('</svg>')) {
        problems.push('不是以 <svg 开头、以 </svg> 结束的完整文档')
    }
    if (!doc.includes('xmlns="http://www.w3.org/2000/svg"')) {
        problems.push('缺少 xmlns="http://www.w3.org/2000/svg"')
    }
    // The root <svg> tag specifically: an inner shape's width/height (a rect)
    // must not count as the canvas declaration.
    const rootTag = doc.slice(0, doc.indexOf('>') + 1)
    if (!/\bviewBox=/.test(rootTag) && !(/\bwidth=/.test(rootTag) && /\bheight=/.test(rootTag))) {
        problems.push('缺少 viewBox 或 width/height')
    }
    if (EXTERNAL_REFERENCE.test(doc)) {
        problems.push('包含外部引用或脚本（image/script/外链）')
    }
    if (RAW_AMPERSAND.test(doc)) {
        problems.push('包含未转义的 &（应写成 &amp;）')
    }
    if (NESTED_ATTRIBUTE_QUOTES.test(doc)) {
        problems.push('属性值里嵌套了双引号，整份文档会解析失败')
    }
    if (doc.length < 200) {
        problems.push('内容太短，不像一张完整图标')
    } else if (!DRAWING_PRIMITIVE.test(doc)) {
        problems.push('没有可渲染的图形元素')
    }

    return problems
}
