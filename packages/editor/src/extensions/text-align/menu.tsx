import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { createRoot } from "react-dom/client";
import { Editor } from "@tiptap/core";
import tippy, { Instance } from "tippy.js";

import { Button } from "../../components";
import { useActive } from "../../hooks/use-active";
import { TextAlign } from "./text-align";
import { AlignCenter, AlignJustify, AlignLeft, AlignRight } from "@repo/icon";
import { Toggle } from "@repo/ui";

const _TextAlignStaticMenu: React.FC<{
  editor: Editor;
  getPopupContainer?: () => HTMLElement;
}> = ({ editor, getPopupContainer }) => {
  const containerRef = useRef<HTMLElement>(null);
  const popupRef = useRef<Instance | null>(null);
  const isAlignCenter = useActive(editor, TextAlign.name, {
    textAlign: "center"
  });
  const isAlignRight = useActive(editor, TextAlign.name, {
    textAlign: "right"
  });
  const isAlignJustify = useActive(editor, TextAlign.name, {
    textAlign: "justify"
  });

  const current = useMemo(() => {
    if (isAlignCenter) {
      return <AlignCenter className="h-4 w-4" />;
    }
    if (isAlignRight) {
      return <AlignRight className="h-4 w-4" />;
    }
    if (isAlignJustify) {
      return <AlignJustify className="h-4 w-4" />;
    }

    return <AlignLeft className="h-4 w-4" />;
  }, [isAlignCenter, isAlignRight, isAlignJustify]);

  const toggle = useCallback(
    (align: string) => {
      return () =>
        editor
          .chain()
          .focus()
          .setTextAlign(align)
          .run();
    },
    [editor]
  );

  useEffect(() => {
    const div = document.createElement("div");
    const root = createRoot(div)
    root.render(
      <>
        <Button onClick={toggle("left")} icon={<AlignLeft className="h-4 w-4" />} />
        <Button onClick={toggle("center")} icon={<AlignCenter className="h-4 w-4" />} />
        <Button onClick={toggle("right")} icon={<AlignRight className="h-4 w-4" />} />
        <Button onClick={toggle("justify")} icon={<AlignJustify className="h-4 w-4" />} />
      </>,
    )

    const popup: Instance[] = tippy("body", {
      getReferenceClientRect: () => {
        return (containerRef.current as HTMLElement).getBoundingClientRect();
      },
      appendTo: getPopupContainer || (() => editor.options.element),
      content: div,
      showOnCreate: false,
      interactive: true,
      popperOptions: {
        strategy: "fixed"
      },
      trigger: "manual",
      placement: "top-start",
      theme: "bubble-menu",
      arrow: false,
      zIndex: 10
    });

    popupRef.current = popup[0]!;

    return () => {
      if (!popupRef.current) return;
      // root.unmount();
    };
  }, [editor, getPopupContainer]);

  return (
    <span ref={containerRef}>
      <Toggle
        onClick={() => {
          popupRef.current?.state.isVisible
            ? popupRef.current.hide()
            : popupRef.current?.show();
        }}
        size="sm"
        pressed={false}
      >
        {current}
      </Toggle>
    </span>
  );
};

export const TextAlignStaticMenu = React.memo(
  _TextAlignStaticMenu,
  (prevProps, nextProps) => {
    return prevProps.editor === nextProps.editor;
  }
);
