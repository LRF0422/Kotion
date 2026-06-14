import { mergeAttributes, PMNode as Node, nodeInputRule } from "@kn/editor";
import { ReactNodeViewRenderer } from "@kn/editor";

import { ImageView } from "./image-view";

export const inputRegex = /(?:^|\s)(!\[(.+|:?)]\((\S+)(?:(?:\s+)["'](\S+)["'])?\))$/;

declare module "@kn/editor" {
  interface Commands<ReturnType> {
    image: {
      setImage: (options: {
        src: string;
        width?: number;
        height?: number;
      }) => ReturnType;
      insertGallery: () => ReturnType;
    };
  }
}

export const Image = Node.create({
  name: "image",
  inline: false,
  content: "",
  marks: "",
  group: "block",
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
    // 数值化的尺寸属性,统一以像素(number)存储;未知时为 null,
    // 由视图在图片加载后按自然尺寸初始化。
    const numberAttr = (attrName: string) => ({
      default: null as number | null,
      parseHTML: (element: HTMLElement) => {
        const raw = element.getAttribute(attrName);
        // 旧数据可能是 "100%" / "auto" 等非像素值,忽略它们,交由视图按自然尺寸重算,
        // 避免 parseInt("100%") => 100 把整宽图片压成 100px。
        if (!raw || raw.endsWith("%") || raw === "auto") return null;
        const n = parseInt(raw, 10);
        return Number.isFinite(n) ? n : null;
      },
      renderHTML: (attrs: Record<string, any>) =>
        attrs[attrName] != null ? { [attrName]: attrs[attrName] } : {}
    });

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
      width: numberAttr("width"),
      height: numberAttr("height"),
      aspectRatio: {
        default: null as number | null,
        parseHTML: (element: HTMLElement) => {
          const raw = element.getAttribute("data-aspect-ratio");
          const n = raw ? parseFloat(raw) : NaN;
          return Number.isFinite(n) && n > 0 ? n : null;
        },
        renderHTML: (attrs: Record<string, any>) =>
          attrs.aspectRatio != null ? { "data-aspect-ratio": attrs.aspectRatio } : {}
      },
      align: {
        default: "left",
        parseHTML: (element: HTMLElement) => element.getAttribute("data-align") || "left",
        renderHTML: (attrs: Record<string, any>) =>
          attrs.align ? { "data-align": attrs.align } : {}
      },
      float: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute("data-float") || null,
        renderHTML: (attrs: Record<string, any>) =>
          attrs.float ? { "data-float": attrs.float } : {}
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
    return ReactNodeViewRenderer(ImageView);
  },
});
