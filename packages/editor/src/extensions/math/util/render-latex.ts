import katex from "katex";
import type { KatexOptions } from "katex";

export interface LatexRenderResult {
  html: string;
  /** KaTeX 报错信息，无错误时为 undefined */
  error?: string;
}

/**
 * 渲染 latex，同时把 KaTeX 的报错信息带出来（用于编辑面板提示），
 * 出错时仍然返回容错渲染结果，避免公式区域空白。
 */
export const renderLatex = (
  latex: string,
  displayMode: boolean,
  options?: KatexOptions
): LatexRenderResult => {
  const base: KatexOptions = { ...(options ?? {}), displayMode };
  try {
    return { html: katex.renderToString(latex, { ...base, throwOnError: true }) };
  } catch (error) {
    return {
      html: katex.renderToString(latex, { ...base, throwOnError: false }),
      error: error instanceof Error ? error.message : String(error),
    };
  }
};
