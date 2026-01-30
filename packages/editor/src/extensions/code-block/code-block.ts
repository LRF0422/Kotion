import BuiltInCodeBlock, {
  CodeBlockOptions
} from "@tiptap/extension-code-block";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { all, createLowlight } from 'lowlight'
import { LowlightPlugin } from "./lowlight-plugin";
import { CodeBlockView } from "./code-block-view";
import { findParentNode } from "prosemirror-utils";
import { Node } from "@tiptap/pm/model";

interface CodeBlockLowlightOptions extends CodeBlockOptions {
  lowlight: any;
  defaultLanguage: string | null | undefined;
  maxTextLength?: number;
  showLineNumbers?: boolean;
}

const lowlight = createLowlight(all)

export const CodeBlock = BuiltInCodeBlock.extend<CodeBlockLowlightOptions>({
  draggable: true,
  priority: 1000,

  // @ts-ignore
  addOptions() {
    return {
      ...this.parent?.(),
      lowlight: {},
      defaultLanguage: null,
      maxTextLength: 10000,
      showLineNumbers: false
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(CodeBlockView);
  },

  addProseMirrorPlugins() {
    return [
      ...(this.parent?.() || []),
      LowlightPlugin({
        name: this.name,
        lowlight: this.options.lowlight,
        defaultLanguage: this.options.defaultLanguage,
        maxTextLength: this.options.maxTextLength || 10000,
      })
    ];
  },

  addKeyboardShortcuts() {
    return {
      ...this?.parent?.(),
      Enter: ({ editor }) => {
        const predicate = (node: Node) =>
          node.type === editor.view.state.schema.nodes.codeBlock;
        const node = findParentNode(predicate)(editor.state.selection);

        if (!node) return false;

        const { $from } = editor.state.selection;

        const isAtEnd = $from.parentOffset === $from.parent.nodeSize - 2;
        const endsWithDoubleNewline = $from.parent.textContent.endsWith("\n\n");

        if (isAtEnd && endsWithDoubleNewline) {
          return editor
            .chain()
            .command(({ tr }) => {
              tr.delete($from.pos - 2, $from.pos);

              return true;
            })
            .exitCode()
            .run();
        }

        return editor.commands.newlineInCode();
      }
    };
  }
}).configure({
  lowlight,
  defaultLanguage: "javascript"
});
