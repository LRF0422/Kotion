import React, { useCallback, useState } from "react";
import { Editor, getMarkRange, posToDOMRect } from "@tiptap/core";

import { BubbleMenu } from "../../../components";
import { useAttributes } from "../../../hooks/use-attributes";
import { IconEdit, IconUnlink, IconVisitlink } from "../../../icons";
import { Link as LinkExtension } from "../link";
import { LinkEdit } from "./edit";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
  Toggle,
  Separator,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from "@kn/ui";

interface IProps {
  editor: Editor;
}

export const LinkBubbleMenu: React.FC<IProps> = ({ editor }) => {
  const [editOpen, setEditOpen] = useState(false);

  const { href, target } = useAttributes(editor, LinkExtension.name, {
    href: "",
    target: ""
  });

  const shouldShow = useCallback(
    () => editor.isActive(LinkExtension.name),
    [editor]
  );

  const getReferenceClientRect = useCallback(() => {
    const { selection } = editor.state;
    const range = getMarkRange(selection.$from, editor.schema.marks.link);
    if (range) {
      return posToDOMRect(editor.view, range.from, range.to);
    }
    return posToDOMRect(editor.view, selection.from, selection.to);
  }, [editor]);




  const visitLink = useCallback(() => {
    if (!href) return;
    const tab = window.open(href, '_blank', 'noopener,noreferrer');
    if (!tab) {
      console.warn('Failed to open link in new tab');
      return;
    }
    tab.opener = null;
  }, [href]);

  const unsetLink = useCallback(
    () => {
      editor
        .chain()
        .extendMarkRange(LinkExtension.name)
        .unsetLink()
        .focus()
        .run();
      setEditOpen(false);
    },
    [editor]
  );

  return (
    <BubbleMenu
      forNode
      getReferenceClientRect={getReferenceClientRect}
      editor={editor}
      shouldShow={shouldShow}
      options={{}}
    >
      <TooltipProvider>
        <div className="flex flex-row items-center gap-1">
          {/* Visit Link */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Toggle
                size="sm"
                onClick={visitLink}
                pressed={false}
                disabled={!href}
                className="hover:bg-accent"
              >
                <IconVisitlink className="h-4 w-4" />
              </Toggle>
            </TooltipTrigger>
            <TooltipContent side="top">
              <p className="text-xs">Open link in new tab</p>
              {href && <p className="text-xs text-muted-foreground max-w-xs truncate">{href}</p>}
            </TooltipContent>
          </Tooltip>

          {/* Edit Link */}
          <Popover open={editOpen} onOpenChange={setEditOpen}>
            <Tooltip>
              <TooltipTrigger asChild>
                <PopoverTrigger asChild>
                  <Toggle size="sm" pressed={editOpen} className="hover:bg-accent">
                    <IconEdit className="h-4 w-4" />
                  </Toggle>
                </PopoverTrigger>
              </TooltipTrigger>
              <TooltipContent side="top">
                <p className="text-xs">Edit link</p>
              </TooltipContent>
            </Tooltip>
            <PopoverContent
              className="p-0 w-auto"
              align="start"
              side="bottom"
              onInteractOutside={() => setEditOpen(false)}
            >
              <LinkEdit
                className="border-none shadow-none"
                editor={editor}
                onOk={() => setEditOpen(false)}
                onCancel={() => setEditOpen(false)}
              />
            </PopoverContent>
          </Popover>

          <Separator orientation="vertical" className="h-6" />

          {/* Remove Link */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Toggle
                size="sm"
                onClick={unsetLink}
                pressed={false}
                className="hover:bg-destructive hover:text-destructive-foreground"
              >
                <IconUnlink className="h-4 w-4" />
              </Toggle>
            </TooltipTrigger>
            <TooltipContent side="top">
              <p className="text-xs">Remove link</p>
            </TooltipContent>
          </Tooltip>
        </div>
      </TooltipProvider>
    </BubbleMenu>
  );
};
