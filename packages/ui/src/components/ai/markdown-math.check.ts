import { strict as assert } from 'node:assert'

import { normalizeMathDelimiters } from './markdown-math'

/**
 * Math delimiter normalization for agent output.
 *
 * Pinned here because these were the failure modes in the transcript:
 *  - Claude writes `\(x\)` / `\[x\]`, DeepSeek writes `$x$`; remark-math
 *    (with streamdown's single-dollar safety) only renders `$$…$$`, so the
 *    formulas used to arrive as literal text;
 *  - `$5 到 $10` is a price range, not a formula — a greedy dollar rule used
 *    to turn the sentence between the prices into a KaTeX error;
 *  - a formula shown as an EXAMPLE in a fenced block or inline code must stay
 *    source (it is documentation, not math);
 *  - a half-streamed delimiter must not open an unfinished math span.
 */

const eq = (actual: string, expected: string, label: string) => {
    assert.equal(actual, expected, `${label}\n  expected: ${JSON.stringify(expected)}\n  actual:   ${JSON.stringify(actual)}`)
}

// ── LaTeX delimiters → remark-math delimiters ────────────────────────
eq(
    normalizeMathDelimiters('欧拉公式 \\(e^{i\\pi}+1=0\\) 成立。'),
    '欧拉公式 $$e^{i\\pi}+1=0$$ 成立。',
    'inline \\(…\\) becomes $$…$$ (inline when framed by text)',
)

eq(
    normalizeMathDelimiters('\\[\\int_0^1 x^2\\,dx = \\frac{1}{3}\\]'),
    '$$\\int_0^1 x^2\\,dx = \\frac{1}{3}$$',
    'display \\[…\\] becomes $$…$$',
)

eq(
    normalizeMathDelimiters('\\[\n\\begin{aligned}\na &= b + c \\\\\nd &= e\n\\end{aligned}\n\\]'),
    '$$\n\\begin{aligned}\na &= b + c \\\\\nd &= e\n\\end{aligned}\n$$',
    'multi-line display math is converted across lines',
)

// ── Single-dollar math ───────────────────────────────────────────────
eq(
    normalizeMathDelimiters('质能方程 $E=mc^2$ 与 $a^2+b^2=c^2$。'),
    '质能方程 $$E=mc^2$$ 与 $$a^2+b^2=c^2$$。',
    'inline $…$ formulas become $$…$$',
)

eq(
    normalizeMathDelimiters('符号 $x$ 和 $\\alpha$ 以及 $2\\pi r$'),
    '符号 $$x$$ 和 $$\\alpha$$ 以及 $$2\\pi r$$',
    'single letter, command and numeric formulas all convert',
)

eq(
    normalizeMathDelimiters('算式 $5 + 3$ 与 $100$'),
    '算式 $$5 + 3$$ 与 $100$',
    'plain arithmetic converts, a bare price does not',
)

// ── Prices and other prose stay prose ────────────────────────────────
eq(
    normalizeMathDelimiters('价格是 $5 到 $10，比例 $\\frac{1}{2}$。'),
    '价格是 $5 到 $10，比例 $$\\frac{1}{2}$$。',
    'price range is not math, the real formula after it still is',
)

eq(
    normalizeMathDelimiters('costs $5 and $10, tax $100'),
    'costs $5 and $10, tax $100',
    'latin price ranges are not math',
)

eq(
    normalizeMathDelimiters('变量 $x$ 的价格 $5'),
    '变量 $$x$$ 的价格 $5',
    'a price next to a formula is still a price',
)

// ── Nothing else moves ───────────────────────────────────────────────
eq(
    normalizeMathDelimiters('已经是 $$\\frac{1}{2}$$ 了'),
    '已经是 $$\\frac{1}{2}$$ 了',
    'existing $$…$$ is untouched',
)

eq(
    normalizeMathDelimiters('```latex\n\\(x^2\\) $y$ \\[z\\]\n```'),
    '```latex\n\\(x^2\\) $y$ \\[z\\]\n```',
    'fenced code is copied verbatim',
)

eq(
    normalizeMathDelimiters('~~~md\n\\(x\\)\n~~~\n普通文本 \\(y\\)'),
    '~~~md\n\\(x\\)\n~~~\n普通文本 $$y$$',
    'tilde fences are copied and scanning resumes after them',
)

eq(
    normalizeMathDelimiters('用 `\\(x\\)` 与 `$y$` 表示行内代码，用 \\(x\\) 表示公式'),
    '用 `\\(x\\)` 与 `$y$` 表示行内代码，用 $$x$$ 表示公式',
    'inline code is copied verbatim',
)

eq(
    normalizeMathDelimiters('a \\\\(x\\\\) b 与 \\$5'),
    'a \\\\(x\\\\) b 与 \\$5',
    'escaped delimiters are not math',
)

// ── Streaming / malformed input ──────────────────────────────────────
eq(
    normalizeMathDelimiters('正在写 \\(\\frac{1}{2}'),
    '正在写 \\(\\frac{1}{2}',
    'unclosed \\( waits for its pair',
)

eq(
    normalizeMathDelimiters('价格 $5 到 $'),
    '价格 $5 到 $',
    'unclosed single dollar stays literal',
)

eq(
    normalizeMathDelimiters('\\(\\)'),
    '\\(\\)',
    'empty pair is left alone',
)

eq(normalizeMathDelimiters(''), '', 'empty input')
eq(
    normalizeMathDelimiters('没有公式'),
    '没有公式',
    'fast path returns the same string',
)

// The conversion is idempotent: a re-render must not keep wrapping dollars.
const once = normalizeMathDelimiters('值 \\(x\\) 与 $y$')
eq(normalizeMathDelimiters(once), once, 'normalization is idempotent')

console.log('markdown-math: all checks passed')