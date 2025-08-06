import React, { useCallback, useMemo, useRef } from "react";
import { Editor } from "@tiptap/core";

import { useActive } from "../../hooks/use-active";
import { TextAlign } from "./text-align";
import { AlignCenter, AlignJustify, AlignLeft, AlignRight } from "@kn/icon";
import { Popover, PopoverContent, PopoverTrigger, Toggle } from "@kn/ui";

const _TextAlignStaticMenu: React.FC<{
  editor: Editor;
  getPopupContainer?: () => HTMLElement;
}> = ({ editor, getPopupContainer }) => {
  const containerRef = useRef<HTMLElement>(null);
  const popupRef = useRef<any | null>(null);
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

  return (
    <span ref={containerRef}>
      <Popover>
        <PopoverTrigger>
          <Toggle
            size="sm"
            pressed={false}
          >
            {current}
          </Toggle>
        </PopoverTrigger>
        <PopoverContent asChild className="w-auto p-1"  >
          <div>
            <Toggle size="sm" onClick={toggle("left")} ><AlignLeft className="h-4 w-4" /></Toggle>
            <Toggle size="sm" onClick={toggle("center")} ><AlignCenter className="h-4 w-4" /></Toggle>
            <Toggle size="sm" onClick={toggle("right")} ><AlignRight className="h-4 w-4" /></Toggle>
            <Toggle size="sm" onClick={toggle("justify")} ><AlignJustify className="h-4 w-4" /></Toggle>
          </div>
        </PopoverContent>
      </Popover>
    </span>
  );
};

export const TextAlignStaticMenu = React.memo(
  _TextAlignStaticMenu,
  (prevProps, nextProps) => {
    return prevProps.editor === nextProps.editor;
  }
);
