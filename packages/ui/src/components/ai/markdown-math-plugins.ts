/**
 * remark/rehype configuration for rendering agent markdown with math.
 *
 * Streamdown's own defaults do not work for our transcripts:
 *  - its rehype pipeline sanitizes *after* KaTeX, and the GitHub sanitize
 *    schema drops `class`/`style` — everything KaTeX's layout needs — leaving
 *    the formula as duplicated, unstyled characters.
 *
 * We keep the defaults it gets right (GFM, CJK-friendly line breaks, raw HTML,
 * link/image hardening, single-dollar math off) and change only that ordering:
 * author HTML is sanitized *before* KaTeX. The KaTeX output is generated from
 * the already-sanitized TeX, so it never needs to be walked by the sanitizer;
 * only the `math` marker classes survive the pass so rehype-katex can still find
 * the nodes.
 *
 * Inline `$…$` is normalized to remark-math's `$$…$$` form by
 * `normalizeMathDelimiters` instead of turning `singleDollarTextMath` on: that
 * keeps `$5 到 $10` (and any other price range) from being parsed as a formula.
 *
 * Imported dynamically from `Streamdown.tsx`, next to `streamdown` itself, so
 * neither the parser nor the KaTeX stylesheet is in the initial bundle.
 */

import { defaultSchema, type Schema } from "hast-util-sanitize";
import type { StreamdownProps } from "streamdown";
import "katex/dist/katex.min.css";

type Plugins = NonNullable<StreamdownProps["remarkPlugins"]>;
type Pluggable = Plugins[number];

/** The plugin objects streamdown exports as its defaults. */
export interface StreamdownPluginDefaults {
  remarkPlugins: Record<string, Pluggable>;
  rehypePlugins: Record<string, Pluggable>;
}

/** Class names remark-math puts on its placeholder nodes. */
const MATH_CLASS = /^(?:math|math-inline|math-display|language-math)$/;

/**
 * GitHub's schema plus the math marker classes on `<span>`.
 *
 * Only the classes matter: the sanitizer runs before KaTeX, so all it has to
 * leave intact is the hook rehype-katex looks for (`math-inline` /
 * `math-display`). Everything KaTeX emits later is kept as-is.
 */
const mathSafeSanitizeSchema: Schema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    span: [["className", MATH_CLASS]],
  },
};

const pluginOf = (entry: Pluggable | undefined): Pluggable | undefined =>
  Array.isArray(entry) ? entry[0] : entry;

/**
 * Build the remark/rehype plugin lists passed to Streamdown.
 *
 * Takes streamdown's exported defaults instead of importing the individual
 * remark/rehype packages: those are streamdown's dependencies, and reusing the
 * very objects it ships keeps this file from drifting out of sync with them.
 */
export function createMathMarkdownPlugins(
  defaults: StreamdownPluginDefaults,
): Pick<StreamdownProps, "remarkPlugins" | "rehypePlugins"> {
  const math = pluginOf(defaults.remarkPlugins.math);
  const sanitize = pluginOf(defaults.rehypePlugins.sanitize);
  const katex = pluginOf(defaults.rehypePlugins.katex);

  // The whole point of this module is the sanitize-before-KaTeX order. If a
  // streamdown upgrade renames those entries, fall back to its own pipeline
  // (math stops rendering, nothing becomes unsafe) instead of running KaTeX
  // without the sanitizer.
  if (!sanitize || !katex) {
    console.warn(
      "[Streamdown] streamdown's default plugins changed; math rendering is disabled",
    );
    return {};
  }

  const remarkPlugins = [
    defaults.remarkPlugins.gfm,
    // Single-dollar math stays off: `normalizeMathDelimiters` has already
    // rewritten the real formulas to `$$…$$`, and a bare `$` is then safe to
    // leave alone (`$5 到 $10` prices).
    math ? [math, { singleDollarTextMath: false }] : undefined,
    defaults.remarkPlugins.cjkFriendly,
    defaults.remarkPlugins.cjkFriendlyGfmStrikethrough,
  ].filter(Boolean) as Plugins;

  const rehypePlugins = [
    defaults.rehypePlugins.raw,
    [sanitize, mathSafeSanitizeSchema],
    [katex, { errorColor: "hsl(var(--destructive))" }],
    defaults.rehypePlugins.harden,
  ].filter(Boolean) as Plugins;

  return { remarkPlugins, rehypePlugins };
}