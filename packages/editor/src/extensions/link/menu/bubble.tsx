import React, { useRef } from "react";
import { Editor } from "@tiptap/core";
import { useCallback } from "react";

import {
  BubbleMenu,
} from "../../../components";
import { useAttributes } from "../../../hooks/use-attributes";
import { IconEdit, IconUnlink, IconVisitlink } from "../../../icons";
import { Link as LinkExtension } from "../link";
import { LinkEdit } from "./edit";
import { Popover, PopoverContent, PopoverTrigger, Toggle } from "@kn/ui";
import { Separator } from "@kn/ui";

interface IProps {
  editor: Editor;
}

export const LinkBubbleMenu: React.FC<IProps> = ({ editor }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  const { href, target } = useAttributes(editor, LinkExtension.name, {
    href: "",
    target: ""
  });

  const shouldShow = useCallback(() => editor.isActive(LinkExtension.name), [
    editor
  ]);



  const visitLink = useCallback(() => {
    const tab = window.open();
    if (!tab) return;
    tab.opener = null;
    tab.location = href;
  }, [href, target]);

  const unsetLink = useCallback(
    () =>
      editor
        .chain()
        .extendMarkRange(LinkExtension.name)
        .unsetLink()
        .run(),
    [editor]
  );

  return (
    <BubbleMenu editor={editor} shouldShow={shouldShow} options={{}}>
      <div ref={containerRef}>
        <div className="flex flex-row gap-1">
          <Toggle size="sm" onClick={visitLink} pressed={false}>
            <IconVisitlink />
          </Toggle>
          <Popover>
            <PopoverTrigger asChild>
              <Toggle size="sm" pressed={false}>
                <IconEdit />
              </Toggle>
            </PopoverTrigger>
            <PopoverContent className="p-1">
              <LinkEdit className=" border-none w-full shadow-none" editor={editor} />
            </PopoverContent>
          </Popover>
          <Separator orientation="vertical" />
          <Toggle size="sm" onClick={unsetLink} pressed={false}>
            <IconUnlink />
          </Toggle>
        </div>
      </div>
    </BubbleMenu>
  );
};
