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
      options = {},
      shouldShow = null
    } = props;

    const plugin = BubbleMenuPlugin({
      pluginKey,
      editor,
      element,
      options,
      shouldShow
    });

    editor.registerPlugin(plugin);
    return () => {
      editor.unregisterPlugin(pluginKey)
    };

  }, [props.editor, element]);

  return (
    <div
      ref={setElement}
      className={props.className}
      style={{
        visibility: "hidden",
        position: "absolute",
      }}
    >
      {props.children}
    </div>
  );
};
