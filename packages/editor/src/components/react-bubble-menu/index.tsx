import { BubbleMenuPlugin, BubbleMenuPluginProps } from "./bubble-menu-pluin";
import React, { EffectCallback, useEffect, useState } from "react";

type Optional<T, K extends keyof T> = Pick<Partial<T>, K> & Omit<T, K>;

export type BubbleMenuProps = Omit<
  Optional<BubbleMenuPluginProps, "pluginKey">,
  "element"
> & {
  className?: string;
  children: React.ReactNode;
};

export const BubbleMenu = (props: BubbleMenuProps) => {
  const [element, setElement] = useState<HTMLDivElement | null>(null);

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

  return (
    <div
      ref={setElement}
      className={props.className}
      style={{
        visibility: "hidden",
        position: "absolute",
        opacity: 0,
        transform: "scale(0.96)",
        transition: "opacity 150ms cubic-bezier(0.16, 1, 0.3, 1), transform 150ms cubic-bezier(0.16, 1, 0.3, 1)",
        zIndex: 1000,
      }}
    >
      {props.children}
    </div>
  );
};
