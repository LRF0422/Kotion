import React, { useCallback, useMemo } from "react";
import { Editor, deleteNodeInner, getAttributes, isNodeSelection, posToDOMRect } from "@kn/editor";

import {
  BubbleMenu,
  BubbleMenuProps,
  Divider
} from "@kn/editor";
import { useAttributes } from "@kn/editor";
import { deleteNode, isNodeActive } from "@kn/editor";
import { Image as ImageExtension } from "../image";
import { Toggle } from "@kn/ui";
import { Captions, IconImageAlignCenter, IconImageAlignLeft, IconImageAlignRight, TbFloatLeft, TbFloatRight, Trash2 } from "@kn/icon";

const _ImageBubbleMenu: React.FC<{ editor: Editor }> = ({ editor }) => {
  const { width: currentWidth, height: currentHeight, align, float, caption } = useAttributes(
    editor,
    ImageExtension.name,
    {
      width: 0,
      height: 0,
      align: "left",
      float: "none",
      caption: null as string | null
    }
  );

  const shouldShow = useCallback<BubbleMenuProps["shouldShow"]>(
    ({ editor }: { editor: Editor }) => {
      return isNodeActive(editor.state, ImageExtension.name);
    },
    [editor.state.selection]
  );

  const getReferenceClientRect = useCallback(() => {
    const { view, state } = editor;
    const { from, to } = state.selection;

    if (isNodeSelection(state.selection)) {
      const node = view.nodeDOM(from) as HTMLElement;

      if (node) {
        const imageElement = node.querySelector("img");

        return (imageElement || node).getBoundingClientRect();
      }
    }

    return posToDOMRect(view, from, to);
  }, [editor]);

  const setAlign = useCallback(
    (align: string) => () => {
      editor
        .chain()
        .updateAttributes(ImageExtension.name, {
          align,
          float: "none"
        })
        .setNodeSelection(editor.state.selection.from)
        .focus()
        .run();
    },
    [editor]
  );

  const setFloat = useCallback(
    (float: string) => () => {
      editor
        .chain()
        .updateAttributes(ImageExtension.name, {
          float
        })
        .setNodeSelection(editor.state.selection.from)
        .focus()
        .run();
    },
    [editor]
  );

  const setAlignLeft = useMemo(() => setAlign("left"), [setAlign]);
  const setAlignCenter = useMemo(() => setAlign("center"), [setAlign]);
  const setAlignRight = useMemo(() => setAlign("right"), [setAlign]);
  const setFloatRight = useMemo(() => setFloat("right"), [setFloat]);
  const setFloatLeft = useMemo(() => setFloat("left"), [setFloat]);

  // 注脚:null = 未启用;切换为 "" 启用(视图会自动聚焦输入框),再次点击移除
  const toggleCaption = useCallback(() => {
    editor
      .chain()
      .updateAttributes(ImageExtension.name, { caption: caption != null ? null : "" })
      .setNodeSelection(editor.state.selection.from)
      .focus()
      .run();
  }, [editor, caption]);

  const deleteMe = useCallback(() => deleteNodeInner(editor, ImageExtension.name), [
    editor
  ]);

  return (
    <BubbleMenu
      key={"image-bubble-menu"}
      editor={editor}
      pluginKey={"image-bubble-menu"}
      shouldShow={shouldShow}
      getReferenceClientRect={getReferenceClientRect}
      options={{}}
      forNode
    >
      <div className="flex items-center gap-1">
        <Toggle
          size="sm"
          pressed={!!(align === "left" && float === "none") as boolean}
          onClick={setAlignLeft}
        >
          <IconImageAlignLeft />
        </Toggle>

        <Toggle
          size="sm"
          pressed={!!(align === "center" && float === "none") as boolean}
          onClick={setAlignCenter}
        >
          <IconImageAlignCenter />
        </Toggle>

        <Toggle
          size="sm"
          pressed={(!!(align === "right" && float === "none")) as boolean}
          onClick={setAlignRight}
        >
          <IconImageAlignRight />
        </Toggle>
        <Divider />
        <Toggle
          size="sm"
          pressed={(!!(float === "right")) as boolean}
          onClick={setFloatRight}
        >
          <TbFloatRight />
        </Toggle>
        <Toggle
          size="sm"
          pressed={(!!(float === "left")) as boolean}
          onClick={setFloatLeft}
        >
          <TbFloatLeft />
        </Toggle>
        <Divider />
        <Toggle size="sm" pressed={(caption != null) as boolean} onClick={toggleCaption}>
          <Captions className="h-4 w-4" />
        </Toggle>
        <Divider />
        <Toggle size="sm" pressed={false} onClick={deleteMe}>
          <Trash2 className="h-4 w-4" />
        </Toggle>
      </div>
    </BubbleMenu>
  );
};

export const ImageBubbleMenu = React.memo(
  _ImageBubbleMenu,
  (prevProps, nextProps) => {
    return prevProps.editor === nextProps.editor;
  }
);
