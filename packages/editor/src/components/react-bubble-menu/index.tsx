import { BubbleMenuPlugin, BubbleMenuPluginProps } from "./bubble-menu-pluin";
import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";

type Optional<T, K extends keyof T> = Pick<Partial<T>, K> & Omit<T, K>;

export type BubbleMenuProps = Omit<
  Optional<BubbleMenuPluginProps, "pluginKey">,
  "element"
> & {
  className?: string;
  children: React.ReactNode;
};

/** Initial animation/paint state, applied to the plugin-owned host element. */
const HOST_STYLE: Array<[keyof CSSStyleDeclaration, string]> = [
  ["visibility", "hidden"],
  ["position", "absolute"],
  ["opacity", "0"],
  ["transform", "scale(0.96)"],
  ["transition", "opacity 150ms cubic-bezier(0.16, 1, 0.3, 1), transform 150ms cubic-bezier(0.16, 1, 0.3, 1)"],
  ["zIndex", "1000"],
];

/**
 * React wrapper around `BubbleMenuPlugin`.
 *
 * The plugin owns the menu's placement: it appends its host element to the
 * editor DOM when showing and `remove()`s it when hiding/destroying. That host
 * element must therefore NOT be a node React renders, or React keeps pointing
 * at the original parent and later fails with
 * `NotFoundError: Failed to execute 'removeChild' on 'Node': The node to be
 * removed is not a child of this node` while deleting this subtree — which is
 * exactly what happened when a window resize crossed the mobile breakpoint and
 * swapped `EditorMenu` out.
 *
 * So we create the host imperatively (once, outside React's tree) and render
 * the menu children into it with `createPortal`. React only manages the
 * children; the plugin is free to append/remove the host. This mirrors
 * Tiptap's own `@tiptap/react/menus` BubbleMenu.
 */
export const BubbleMenu = (props: BubbleMenuProps) => {
  // Stable, plugin-owned host. `useState`'s lazy initializer keeps the same
  // node across renders (and StrictMode double-invokes) without a ref hack.
  const [element] = useState<HTMLDivElement | null>(() =>
    typeof document === "undefined" ? null : document.createElement("div")
  );

  // React no longer controls this node, so mirror `className` and the base
  // paint state imperatively. The plugin overrides the positioning styles.
  useEffect(() => {
    if (!element) return;
    element.className = props.className ?? "";
    for (const [prop, value] of HOST_STYLE) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (element.style as any)[prop] = value;
    }
  }, [element, props.className]);

  useEffect(() => {
    if (!element) {
      return;
    }
    if (props.editor.isDestroyed) {
      return;
    }

    const {
      pluginKey = "bubbleMenu",
      editor,
      appendTo,
      options = {},
      shouldShow = null
    } = props;

    const plugin = BubbleMenuPlugin({
      pluginKey,
      editor,
      element,
      appendTo,
      options,
      shouldShow
    });

    editor.registerPlugin(plugin);
    return () => {
      editor.unregisterPlugin(pluginKey)
    };

  }, [props.editor, props.appendTo, element]);

  if (!element) return null;
  return createPortal(props.children, element);
};

BubbleMenu.displayName = "BubbleMenu";
