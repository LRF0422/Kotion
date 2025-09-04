import { mergeAttributes, Node, nodeInputRule } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";

import { ImageView } from "./image-view";
import { ImageInlineView } from "./image-inline-view";

export const inputRegex = /(?:^|\s)(!\[(.+|:?)]\((\S+)(?:(?:\s+)["'](\S+)["'])?\))$/;

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    // @ts-ignore
    image: {
      setImage: (options: {
        src: string;
        width?: number;
        height?: number;
      }) => ReturnType;
    };
  }
}

export const ImageInline = Node.create({
  name: "imageInline",
  inline: true,
  content: "",
  marks: "",
  group: "inline",
  selectable: true,
  draggable: true,

  addOptions() {
    return {
      inline: false,
      allowBase64: false,
      HTMLAttributes: {}
    };
  },

  addAttributes() {
    return {
      src: {
        default: null
      },
      alt: {
        default: null
      },
      title: {
        default: null
      },
      width: {
        default: "100%"
      },
      height: {
        default: "auto"
      },
      aspectRatio: {
        default: 1
      },
      align: {
        default: "left"
      }
    };
  },

  parseHTML() {
    return [
      {
        tag: "img[src]"
      }
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "img",
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes)
    ];
  },

  addCommands() {
    return {
      setImage: options => ({ commands, chain }) => {
        return chain().focus().insertContent({
          type: this.name,
          attrs: options
        }).run();
      }
    };
  },

  addInputRules() {
    return [
      nodeInputRule({
        find: inputRegex,
        type: this.type,
        getAttributes: match => {
          const [, , alt, src, title] = match;

          return { src, alt, title };
        }
      })
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ImageInlineView);
  },

  // addProseMirrorPlugins() {
  //   return [new Plugin({
  //     key: new PluginKey("ImagePastPlugin"),
  //     props: {
  //       handlePaste(view, event, slice) {
  //         console.log('clipboardData', event.clipboardData);
  //         console.log('slice', slice)
  //       },
  //     }
  //   })]
  // },
});
