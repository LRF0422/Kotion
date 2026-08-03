import { Extension } from "@tiptap/core";

import { InlineMathNode } from "./inline-math-node";
import { DEFAULT_OPTIONS, MathExtensionOption } from "./util/options";
import { ExtensionWrapper } from "@kn/common";
import { Sigma, SquareSigma } from "@kn/icon";
import React from "react";
import "katex/dist/katex.min.css";

export const MATH_EXTENSION_NAME = "mathExtension";
const MathExtension = Extension.create<MathExtensionOption>({
  name: MATH_EXTENSION_NAME,

  addOptions() {
    return DEFAULT_OPTIONS;
  },

  addExtensions() {
    const extensions = [];
    if (this.options.addInlineMath !== false) {
      extensions.push(InlineMathNode.configure(this.options));
    }

    return extensions;
  },
});

export { InlineMathNode, DEFAULT_OPTIONS };
export type { MathExtensionOption };
export { MathView } from "./math-view";
export { MathEditorPanel } from "./math-editor-panel";
export { LATEX_SNIPPET_GROUPS, LATEX_COMMANDS } from "./util/latex-snippets";
export type { LatexSnippet, LatexSnippetGroup, LatexCommand } from "./util/latex-snippets";
export { renderLatex } from "./util/render-latex";

export const KnowledgeMathExtension: ExtensionWrapper = {
  name: 'math',
  extendsion: MathExtension.configure({ evaluation: false, katexOptions: { macros: { "\\B": "\\mathbb{B}" } }, delimiters: "dollar" }),
  slashConfig: [
    {
      icon: <Sigma className="h-4 w-4" />,
      text: '行内公式',
      slash: '/math',
      action: (editor) => {
        editor.chain().focus().insertInlineMath().run()
      }
    },
    {
      icon: <SquareSigma className="h-4 w-4" />,
      text: '块级公式（多行）',
      slash: '/formula',
      action: (editor) => {
        editor.chain().focus().insertBlockMath().run()
      }
    }
  ],
}
