import { Content, InputRule, mergeAttributes, Node, PasteRule } from "@tiptap/core";
import { NodeSelection, Plugin, PluginKey } from "@tiptap/pm/state";
import { ReactNodeViewRenderer } from "@tiptap/react";
import {
  AllVariableUpdateListeners,
  MathVariables,
} from "./latex-evaluation/evaluate-expression";
import { MathView } from "./math-view";
import { DEFAULT_OPTIONS, MathExtensionOption, MathExtensionOption as MathExtensionOptions } from "./util/options";


declare module '@tiptap/core' {
  interface Storage {
    inlineMath: any;
  }

  interface Commands<ReturnType> {
    inlineMath: {
      /** 插入行内公式，latex 为空时直接进入编辑态 */
      insertInlineMath: (latex?: string) => ReturnType;
      /** 插入块级公式，支持多行 latex */
      insertBlockMath: (latex?: string) => ReturnType;
    };
  }
}

export const InlineMathNode = Node.create<MathExtensionOptions>({
  name: "inlineMath",
  group: "inline",
  inline: true,
  selectable: true,
  atom: true,

  addOptions() {
    return DEFAULT_OPTIONS;
  },


  addAttributes() {
    return {
      latex: {
        default: "x_1",
        parseHTML: (element) => element.getAttribute("data-latex"),
        renderHTML: (attributes) => {
          return {
            "data-latex": attributes.latex,
          };
        },
      },
      evaluate: {
        default: "no",
        parseHTML: (element) => element.getAttribute("data-evaluate"),
        renderHTML: (attributes) => {
          return {
            "data-evaluate": attributes.evaluate,
          };
        },
      },
      display: {
        default: "no",
        parseHTML: (element) => element.getAttribute("data-display"),
        renderHTML: (attributes) => {
          return {
            "data-display": attributes.display,
          };
        },
      },
    };
  },

  addInputRules() {
    const inputRules = [];
    // `$$` + 空格：插入空的块级公式并直接进入编辑面板，用于多行公式录入
    inputRules.push(
      new InputRule({
        find: /\$\$[ \t]$/,
        handler: (props) => {
          props
            .chain()
            .insertContentAt(
              { from: props.range.from, to: props.range.to },
              [
                {
                  type: "inlineMath",
                  attrs: { latex: "", evaluate: "no", display: "yes" },
                },
              ],
              { updateSelection: true }
            )
            .run();
        },
      })
    );
    const blockRegex = getRegexFromOptions("block", this.options);
    if (blockRegex !== undefined) {
      inputRules.push(
        new InputRule({
          find: new RegExp(blockRegex, ""),
          handler: (props) => {
            let latex = props.match[1];
            if (props.match[1]!.length === 0) {
              return;
            }
            const showRes = latex!.endsWith("=");
            if (showRes) {
              latex = latex!.substring(0, latex!.length - 1);
            }
            let content: Content = [
              {
                type: "inlineMath",
                attrs: { latex: latex, evaluate: showRes ? "yes" : "no", display: "yes" },
              },
            ];
            props
              .chain()
              .insertContentAt(
                {
                  from: props.range.from,
                  to: props.range.to,
                },
                content,
                { updateSelection: true }
              )
              .run();
          },
        })
      );
    }
    const inlineRegex = getRegexFromOptions("inline", this.options);
    if (inlineRegex !== undefined) {
      inputRules.push(
        new InputRule({
          find: new RegExp(inlineRegex, ""),
          handler: (props) => {
            if (props.match[1]!.length === 0) {
              return;
            }
            // TODO: Better handling, also for custom regexes
            // This prevents that $$x_1$ (a block expression in progress) is already captured by inline input rules
            if (
              (this.options.delimiters === undefined || this.options.delimiters === "dollar") &&
              (props.match[1]!.startsWith("$") || props.match[0].startsWith("$$"))
            ) {
              return;
            }
            let latex = props.match[1];
            latex = latex!.trim();
            const showRes = latex.endsWith("=");
            if (showRes) {
              latex = latex.substring(0, latex.length - 1);
            }
            let content: Content = [
              {
                type: "inlineMath",
                attrs: { latex: latex, evaluate: showRes ? "yes" : "no", display: "no" },
              },
            ];
            props
              .chain()
              .insertContentAt(
                {
                  from: props.range.from,
                  to: props.range.to,
                },
                content,
                { updateSelection: true }
              )
              .run();
          },
        })
      );
    }
    return inputRules;
  },

  addPasteRules() {
    const pasteRules = [];
    const blockRegex = getRegexFromOptions("block", this.options);
    if (blockRegex !== undefined) {
      pasteRules.push(
        new PasteRule({
          find: new RegExp(blockRegex, "g"),
          handler: (props) => {
            const latex = props.match[1];
            props
              .chain()
              .insertContentAt(
                { from: props.range.from, to: props.range.to },
                [
                  {
                    type: "inlineMath",
                    attrs: { latex: latex, evaluate: "no", display: "yes" },
                  },
                ],
                { updateSelection: true }
              )
              .run();
          },
        })
      );
    }
    const inlineRegex = getRegexFromOptions("inline", this.options);
    if (inlineRegex !== undefined) {
      pasteRules.push(
        new PasteRule({
          find: new RegExp(inlineRegex, "g"),
          handler: (props) => {
            const latex = props.match[1];
            props
              .chain()
              .insertContentAt(
                { from: props.range.from, to: props.range.to },
                [
                  {
                    type: "inlineMath",
                    attrs: { latex: latex, evaluate: "no", display: "no" },
                  },
                ],
                { updateSelection: true }
              )
              .run();
          },
        })
      );
    }
    return pasteRules;
  },

  parseHTML() {
    return [
      {
        tag: `span[data-type="${this.name}"]`,
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    let latex = "x";
    if (node.attrs.latex && typeof node.attrs.latex == "string") {
      latex = node.attrs.latex;
    }
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-type": this.name,
      }),
      getDelimiter(node.attrs.display === "yes" ? "block" : "inline", "start", this.options) +
      latex +
      getDelimiter(node.attrs.display === "yes" ? "block" : "inline", "end", this.options),
    ];
  },

  addKeyboardShortcuts() {
    return {
      Backspace: () =>
        this.editor.commands.command(({ tr, state }) => {
          let isMention = false;
          const { selection } = state;
          const { empty, anchor } = selection;
          if (!empty) {
            return false;
          }
          state.doc.nodesBetween(anchor - 1, anchor, (node, pos) => {
            if (node.type.name === this.name) {
              isMention = true;
              // 多行公式转回文本会丢掉换行，改为选中节点交给用户决定
              if (typeof node.attrs.latex === "string" && node.attrs.latex.includes("\n")) {
                tr.setSelection(NodeSelection.create(tr.doc, pos));
                return;
              }
              const displayMode = node.attrs.display === "yes";
              const firstDelimiter = getDelimiter(displayMode ? "block" : "inline", "start", this.options);
              let secondDelimiter = getDelimiter(displayMode ? "block" : "inline", "end", this.options);
              secondDelimiter = secondDelimiter.substring(0, secondDelimiter.length - 1);
              tr.insertText(firstDelimiter + (node.attrs.latex || "") + secondDelimiter, pos, anchor);
            }
          });
          return isMention;
        }),
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(MathView);
  },

  addCommands() {
    return {
      insertInlineMath:
        (latex = "") =>
          ({ commands }) =>
            commands.insertContent({
              type: this.name,
              attrs: { latex, evaluate: "no", display: "no" },
            }),
      insertBlockMath:
        (latex = "") =>
          ({ commands }) =>
            commands.insertContent({
              type: this.name,
              attrs: { latex, evaluate: "no", display: "yes" },
            }),
    };
  },

  addProseMirrorPlugins() {
    const name = this.name;
    const options = this.options;
    return [
      new Plugin({
        key: new PluginKey("inlineMathMultilinePaste"),
        props: {
          // 整段粘贴的多行公式（如 $$\n\begin{aligned}...\n$$）直接转为块级公式，
          // 默认的粘贴规则逐行匹配，无法保留换行
          handlePaste: (view, event) => {
            const text = event.clipboardData?.getData("text/plain")?.trim();
            if (!text || !text.includes("\n")) {
              return false;
            }
            const start = getDelimiter("block", "start", options);
            const end = getDelimiter("block", "end", options);
            if (
              !text.startsWith(start) ||
              !text.endsWith(end) ||
              text.length <= start.length + end.length
            ) {
              return false;
            }
            const latex = text.slice(start.length, text.length - end.length).trim();
            if (!latex) {
              return false;
            }
            const type = view.state.schema.nodes[name];
            if (!type) {
              return false;
            }
            view.dispatch(
              view.state.tr
                .replaceSelectionWith(type.create({ latex, evaluate: "no", display: "yes" }))
                .scrollIntoView()
            );
            return true;
          },
        },
      }),
    ];
  },

  addStorage(): {
    variables: MathVariables;
    variableListeners: AllVariableUpdateListeners;
  } {
    return {
      variables: {},
      variableListeners: {},
    };
  },
});

export function getRegexFromOptions(mode: "inline" | "block", options: MathExtensionOption): string | undefined {
  if (options.delimiters === undefined || options.delimiters === "dollar") {
    if (mode === "inline") {
      return String.raw`(?<!\$)\$(?![$\s,.])((?:[^$\\]|\\\$|\\)+?(?<![\\\s(["]))\$`;
    } else {
      return String.raw`\$\$(?!\s)(.*?(?<!\\))\$\$`;
    }
  } else if (options.delimiters === "bracket") {
    if (mode === "inline") {
      return String.raw`\\\((.*?[^\\])\\\)`;
    } else {
      return String.raw`\\\[(.*?[^\\])\\\]`;
    }
  } else {
    if (mode === "inline") {
      return options.delimiters.inlineRegex;
    } else {
      return options.delimiters.blockRegex;
    }
  }
}

function getDelimiter(mode: "inline" | "block", position: "start" | "end", options: MathExtensionOption) {
  if (options.delimiters === undefined || options.delimiters === "dollar") {
    if (mode === "inline") {
      return "$";
    } else {
      return "$$";
    }
  } else if (options.delimiters === "bracket") {
    if (mode === "inline") {
      if (position === "start") {
        return String.raw`\(`;
      } else {
        return String.raw`\)`;
      }
    } else {
      if (position === "start") {
        return String.raw`\[`;
      } else {
        return String.raw`\]`;
      }
    }
  } else {
    if (mode === "inline") {
      if (position === "start") {
        return options.delimiters.inlineStart ?? "$";
      } else {
        return options.delimiters.inlineEnd ?? "$";
      }
    } else {
      if (position === "start") {
        return options.delimiters.blockStart ?? "$$";
      } else {
        return options.delimiters.blockEnd ?? "$$";
      }
    }
  }
}
