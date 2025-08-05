import { Extension } from "@tiptap/core";
import { BubbleMenuPlugin, BubbleMenuPluginProps } from "./bubble-menu-plugin";

export type BubbleMenuOptions = Omit<
  BubbleMenuPluginProps,
  "editor" | "element"
> & {
  element: HTMLElement | null;
};

export const BubbleMenu = Extension.create<BubbleMenuOptions>({
  name: "bubbleMenu",

  addOptions() {
    return {
      element: null,
      options: {
        strategy: "absolute",
      },
      pluginKey: "bubbleMenu",
      shouldShow: null
    };
  },

  // @ts-ignore
  addProseMirrorPlugins() {
    if (!this.options.element) {
      return [];
    }

    return [
      BubbleMenuPlugin({
        pluginKey: this.options.pluginKey,
        editor: this.editor,
        element: this.options.element,
        options: this.options.options,
        shouldShow: this.options.shouldShow
      })
    ];
  }
});
