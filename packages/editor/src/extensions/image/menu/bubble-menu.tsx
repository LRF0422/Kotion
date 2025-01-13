import React, { useCallback, useMemo } from "react";
import { Editor, isNodeSelection, posToDOMRect } from "@tiptap/core";

import {
  BubbleMenu,
  BubbleMenuProps,
  Button,
  Divider
} from "../../../components";
import {
  IconImageAlignLeft,
  IconImageAlignCenter,
  IconImageAlignRight,
  IconDelete
} from "../../../icons";
import { useAttributes } from "../../../hooks/use-attributes";
import { deleteNode, isNodeActive } from "../../../utilities";
import { Image as ImageExtension } from "../image";

const _ImageBubbleMenu: React.FC<{ editor: Editor }> = ({ editor }) => {
  const { width: currentWidth, height: currentHeight, align } = useAttributes(
    editor,
    ImageExtension.name,
    {
      width: 0,
      height: 0,
      align: "left"
    }
  );

  const shouldShow = useCallback<BubbleMenuProps["shouldShow"]>(
    ({ editor }) => {
      return isNodeActive(editor, ImageExtension.name);
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
          align
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

  const deleteMe = useCallback(() => deleteNode(editor, ImageExtension.name), [
    editor
  ]);

  return (
    <BubbleMenu
      key={"image-bubble-menu"}
      editor={editor}
      pluginKey={"image-bubble-menu"}
      shouldShow={shouldShow}
      tippyOptions={{
        getReferenceClientRect
      }}
      forNode>
      <div>
          <Button
            size="small"
            active={!!(align === "left")}
            icon={<IconImageAlignLeft />}
            onClick={setAlignLeft}
          />

          <Button
            size="small"
            active={!!(align === "center")}
            icon={<IconImageAlignCenter />}
            onClick={setAlignCenter}
          />

          <Button
            size="small"
            active={!!(align === "right")}
            icon={<IconImageAlignRight />}
            onClick={setAlignRight}
          />

        <Divider />
          <Button size="small" icon={<IconDelete />} onClick={deleteMe} />
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
