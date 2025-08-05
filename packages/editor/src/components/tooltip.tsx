import React, { useMemo, useState, useEffect } from "react";
import { Editor } from "@tiptap/core";
import { computePosition } from "@floating-ui/dom";
// import tippy, { Placement } from "tippy.js";
type ZLevel = "default" | "middle" | "highest";

export const Tooltip: React.FC<React.PropsWithChildren<{
  editor: Editor;
  title: string;
  zLevel?: ZLevel;
  placement?: any;
}>> = ({ editor, title, zLevel = "middle", placement = "top", children }) => {
  const [element, setElement] = useState<HTMLSpanElement | null>(null);

  const zIndex = useMemo(() => {
    switch (zLevel) {
      case "highest":
        return 10000;

      case "middle":
        return 1500;

      case "default":
      default:
        return 10;
    }
  }, [zLevel]);

  useEffect(() => {
    if (!element) return;

    // const popup = tippy(element, {
    //   appendTo: () => editor.options.element,
    //   theme: "tooltip",
    //   content: title,
    //   zIndex,
    //   placement
    // });
    const el = document.createElement("div");
    el.innerText = title
    computePosition(element,el , {})

    return () => {
      // popup.destroy();
    };
  }, [editor, element, title, zIndex, placement]);

  return (
    <>
      <span ref={setElement}>{children}</span>
    </>
  );
};
