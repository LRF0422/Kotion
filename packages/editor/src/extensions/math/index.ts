import { Extension } from "@tiptap/core";

import { InlineMathNode } from "./inline-math-node";
import { DEFAULT_OPTIONS, MathExtensionOption } from "./util/options";
import { ExtensionWrapper } from "@kn/common";
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

export const KnowledgeMathExtension: ExtensionWrapper = {
  name: 'math',
  extendsion: MathExtension.configure({ evaluation: false, katexOptions: { macros: { "\\B": "\\mathbb{B}" } }, delimiters: "dollar" })
}
