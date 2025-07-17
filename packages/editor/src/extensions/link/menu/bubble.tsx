import React, { useRef } from "react";
import { Editor } from "@tiptap/core";
import { useCallback } from "react";

import {
  BubbleMenu,
} from "../../../components";
import { useAttributes } from "../../../hooks/use-attributes";
import { IconEdit, IconUnlink, IconVisitlink } from "../../../icons";
import { Link as LinkExtension } from "../link";
import { showLinkEditor } from "./edit";
import { Toggle } from "@kn/ui";
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

  const openEditLinkModal = useCallback(() => {
    showLinkEditor(editor, containerRef.current as HTMLElement);
  }, [editor]);

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
    <BubbleMenu editor={editor} shouldShow={shouldShow} tippyOptions={{ theme: 'light' }}>
      <div ref={containerRef}>
        <div className="flex flex-row gap-1">
          <Toggle size="sm" onClick={visitLink} pressed={false}>
            <IconVisitlink />
          </Toggle>
          <Toggle size="sm" onClick={openEditLinkModal} pressed={false}>
            <IconEdit />
          </Toggle>
          <Separator orientation="vertical" />
          <Toggle size="sm" onClick={unsetLink} pressed={false}>
            <IconUnlink />
          </Toggle>
        </div>
      </div>
    </BubbleMenu>
  );
};
