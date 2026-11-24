/**
 * Math delimiters the agent may emit vs. what remark-math understands.
 *
 * remark-math recognizes `$$…$$` only (streamdown turns single-dollar text math
 * off to keep prices readable). Models write three different things:
 *   - `$x$`      — DeepSeek and most chat models;
 *   - `\(x\)`    — Claude, trained on LaTeX;
 *   - `\[x\]`    — display math in the same convention.
 * Left alone, the last two reach the transcript as literal backslashes and the
 * first one as a lone dollar sign, so the "formula" the agent wrote never
 * renders.
 *
 * This module rewrites the three spellings into the `$$…$$` form remark-math
 * accepts. A single-line `$$…$$` is parsed as *inline* math by remark-math, so
 * inline formulas stay inline; a `$$` pair on its own lines stays display math.
 *
 * Two rules keep the rewrite honest:
 *   - code is data, not math: fenced blocks and inline code spans are copied
 *     verbatim, so a formula shown as an example keeps its source;
 *   - a lone `$` is only treated as math when its body actually looks like
 *     math. `$5 到 $10` (Chinese price range) and `$5 and $10` must survive a
 *     chat turn unchanged, while `$x^2$` must not.
 *
 * Unpaired delimiters are left untouched: a half-streamed `\(` must not open a
 * span the model has not finished writing.
 */

/** A fence may be indented up to three spaces (`~~~` and ``` both count). */
const fenceAt = (
  text: string,
  index: number,
): { marker: string; length: number } | undefined => {
  let cursor = index;
  let indent = 0;
  while (indent < 3 && text[cursor] === " ") {
    cursor += 1;
    indent += 1;
  }
  const marker = text[cursor];
  if (marker !== "`" && marker !== "~") return undefined;
  let length = 0;
  while (text[cursor + length] === marker) length += 1;
  return length >= 3 ? { marker, length } : undefined;
};

const isFenceLine = (line: string, marker: string, length: number): boolean => {
  const trimmed = line.replace(/^ {0,3}/, "").trimEnd();
  if (trimmed.length < length) return false;
  for (let index = 0; index < trimmed.length; index += 1) {
    if (trimmed[index] !== marker) return false;
  }
  return true;
};

/** Text in a `$…$` body suggesting prose (a price range) rather than math. */
const CJK = /[\u2E80-\u9FFF\uF900-\uFAFF\u3040-\u30FF\uAC00-\uD7AF]/;
const LATIN = /[A-Za-z]/;
/** Digits and separators only — `$5,000` is money, not a formula. */
const NUMBER_ONLY = /^[\d.,%\s]+$/;

/**
 * Whether the body between two `$` is a formula.
 *
 * Deliberately conservative: a false negative shows `$x$` literally (an
 * annoyance), a false positive swallows the sentence between two prices. A
 * backslash command is always math (`\frac`, `\alpha`, `\text{…}`); a CJK body
 * is prose, and a body that is nothing but digits and separators (`$100$`) is
 * treated as a price rather than a number formula — plain arithmetic
 * (`$5 + 3$`) still counts as math.
 */
const looksLikeMath = (body: string): boolean => {
  if (!body || body !== body.trim()) return false;
  if (body.includes("$")) return false;
  // `\(…\)` / `\[…\]` are handled separately; don't swallow them.
  if (body.includes("\\(") || body.includes("\\[")) return false;
  if (/\\[A-Za-z]+/.test(body)) return true;
  if (CJK.test(body)) return false;
  if (/[\^_{}=<>≤≥]/.test(body)) return true;
  if (NUMBER_ONLY.test(body)) return false;
  // Plain arithmetic (`$5 + 3$`) but not a bare price (`$100`).
  if (/[+\-*/×÷]/.test(body) && /\d/.test(body)) return true;
  return LATIN.test(body);
};

/**
 * Normalize `\(…\)`, `\[…\]` and math-looking `$…$` to `$$…$$` outside code.
 *
 * Safe to run on every streaming frame: it only rewrites text, never code, and
 * only converts a `$` pair once both halves are present.
 */
export function normalizeMathDelimiters(markdown: string): string {
  if (
    !markdown ||
    (!markdown.includes("$") &&
      !markdown.includes("\\(") &&
      !markdown.includes("\\["))
  ) {
    return markdown;
  }

  let out = "";
  let index = 0;

  while (index < markdown.length) {
    const atLineStart = out.length === 0 || out.endsWith("\n");

    // ── Fenced code block: copy through its closing fence untouched ──
    if (atLineStart) {
      const fence = fenceAt(markdown, index);
      if (fence) {
        const { marker, length } = fence;
        let lineEnd = markdown.indexOf("\n", index);
        if (lineEnd === -1) {
          out += markdown.slice(index);
          break;
        }
        out += markdown.slice(index, lineEnd + 1);
        index = lineEnd + 1;

        while (index < markdown.length) {
          lineEnd = markdown.indexOf("\n", index);
          const line = markdown.slice(index, lineEnd === -1 ? markdown.length : lineEnd);
          out += line;
          if (lineEnd === -1) {
            index = markdown.length;
            break;
          }
          out += "\n";
          index = lineEnd + 1;
          if (isFenceLine(line, marker, length)) break;
        }
        continue;
      }
    }

    // ── Inline code span: copy the whole run ──
    if (markdown[index] === "`") {
      let run = 0;
      while (markdown[index + run] === "`") run += 1;
      const ticks = "`".repeat(run);
      const close = markdown.indexOf(ticks, index + run);
      if (close === -1) {
        out += ticks;
        index += run;
      } else {
        out += markdown.slice(index, close + run);
        index = close + run;
      }
      continue;
    }

    // ── LaTeX delimiters: `\(…\)` and `\[…\]` ──
    if (
      markdown[index] === "\\" &&
      (markdown[index + 1] === "(" || markdown[index + 1] === "[") &&
      // `\\(` is an escaped backslash followed by a literal paren, not a delimiter.
      markdown[index - 1] !== "\\"
    ) {
      const inline = markdown[index + 1] === "(";
      const closeToken = inline ? "\\)" : "\\]";
      const close = markdown.indexOf(closeToken, index + 2);
      if (close !== -1) {
        const body = markdown.slice(index + 2, close);
        if (body.trim()) {
          // Both forms become `$$…$$`: inline on one line (remark-math keeps it
          // inline), display when the pair owns its lines.
          out += `$$${body}$$`;
          index = close + 2;
          continue;
        }
      }
    }

    // ── Single-dollar math: only when it actually looks like math ──
    if (markdown[index] === "$") {
      let run = 0;
      while (markdown[index + run] === "$") run += 1;
      // `$$…$$` is already remark-math syntax; `\$` is an escaped dollar.
      if (run > 1 || markdown[index - 1] === "\\") {
        out += markdown.slice(index, index + run);
        index += run;
        continue;
      }
      const next = markdown[index + 1];
      if (!next || /\s/.test(next)) {
        out += "$";
        index += 1;
        continue;
      }

      let cursor = index + 1;
      let converted = false;
      while (cursor < markdown.length) {
        const close = markdown.indexOf("$", cursor);
        if (close === -1) break;
        if (markdown[close - 1] === "\\") {
          cursor = close + 1;
          continue;
        }
        // A `$$` run inside the candidate body means the `$` was not a closer.
        if (markdown[close + 1] === "$") {
          cursor = close + 2;
          continue;
        }
        const body = markdown.slice(index + 1, close);
        const after = markdown[close + 1];
        // `$5 to $10`: the closer is followed by a digit.
        if (after && /\d/.test(after)) {
          cursor = close + 1;
          continue;
        }
        // A closer preceded by whitespace is not a closer.
        if (!body || /\s$/.test(body)) {
          cursor = close + 1;
          continue;
        }
        if (looksLikeMath(body)) {
          out += `$$${body}$$`;
          index = close + 1;
          converted = true;
        }
        break;
      }
      if (converted) continue;
      out += "$";
      index += 1;
      continue;
    }

    out += markdown[index];
    index += 1;
  }

  return out;
}