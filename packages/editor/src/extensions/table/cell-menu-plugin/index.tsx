import {
  BubbleMenuPlugin,
  BubbleMenuPluginProps
} from "@tiptap/extension-bubble-menu";
import { Editor, findParentNode, posToDOMRect } from "@tiptap/core";
import tippy, { Instance } from "tippy.js";
import { createRoot } from "react-dom/client";
import React, { useCallback, useEffect, useRef } from "react";
import { Node as PMNode } from "@tiptap/pm/model";
import { Plugin } from "@tiptap/pm/state";
const cellButtonsConfig = [
  {
    name: "insertRowUp",
    action: (editor: Editor) =>
      editor
        .chain()
        .focus()
        // @ts-ignore
        .addRowBefore()
        .run()
  },
  {
    name: "insertRowDown",
    action: (editor: Editor) =>
      editor
        .chain()
        .focus()
        // @ts-ignore
        .addRowAfter()
        .run()
  },
  {
    name: "removeRows",
    action: (editor: Editor) =>
      editor
        .chain()
        .focus()
        // @ts-ignore
        .deleteRow()
        .run()
  },
  {
    divider: true
  },
  {
    name: "insertColumnLeft",
    action: (editor: Editor) =>
      editor
        .chain()
        .focus()
        // @ts-ignore
        .addColumnBefore()
        .run()
  },
  {
    name: "insertColumnRight",
    action: (editor: Editor) =>
      editor
        .chain()
        .focus()
        // @ts-ignore
        .addColumnAfter()
        .run()
  },
  {
    name: "removeColumns",
    action: (editor: Editor) =>
      editor
        .chain()
        .focus()
        // @ts-ignore
        .deleteColumn()
        .run()
  },
  {
    divider: true
  },
  {
    name: "toggleHeaderRow",
    action: (editor: Editor) =>
      editor
        .chain()
        .focus()
        // @ts-ignore
        .toggleHeaderRow()
        .run()
  },
  {
    name: "toggleHeaderColumn",
    action: (editor: Editor) =>
      editor
        .chain()
        .focus()
        // @ts-ignore
        .toggleHeaderColumn()
        .run()
  },
  {
    name: "toggleHeaderCell",
    action: (editor: Editor) =>
      editor
        .chain()
        .focus()
        // @ts-ignore
        .toggleHeaderCell()
        .run()
  },
  {
    divider: true
  },
  {
    name: "删除",
    action: (editor: Editor) =>
      editor
        .chain()
        .focus()
        // @ts-ignore
        .deleteTable()
        .run()
  }
];

const predicateIsTableCell = (node: PMNode) =>
  ["tableHeader", "tableCell"].includes(node.type.name);

const TableCellMenu: React.FC<React.PropsWithChildren<{
  editor: Editor;
}>> = ({ editor }) => {
  const popupRef = useRef<Instance | null>(null);

  const toggleVisible = useCallback(() => {
    popupRef.current?.state.isVisible
      ? popupRef.current.hide()
      : popupRef.current?.show();
  }, []);

  useEffect(() => {
    const div = document.createElement("div");

    const root = createRoot(div)
    root.render(
      // <Menu
      //   style={{
      //     minWidth: 200,
      //     padding: "0 !important"
      //   }}>
      //   {cellButtonsConfig.map((btn, index) => {
      //     return btn.divider ? (
      //       <Divider key={index}/>
      //     ) : (
      //       <Menu.Item key={btn.name} onClick={() => btn?.action?.(editor)}>
      //         {btn.name}
      //       </Menu.Item>
      //     );
      //   })}
      // </Menu>
      <div></div>
    )

    const popup: Instance[] = tippy("body", {
      getReferenceClientRect: () => {
        const { selection } = editor.state;
        const parent = findParentNode(predicateIsTableCell)(selection);

        // @ts-ignore
        if (editor.view.docView) {
          const dom = editor.view.nodeDOM(parent?.pos as number) as HTMLElement;
          return dom.getBoundingClientRect();
        } else {
          return posToDOMRect(
            editor.view,
            editor.state.selection.from,
            editor.state.selection.to
          );
        }
      },
      appendTo: () => {
        return editor.options.element;
      },
      content: div,
      showOnCreate: false,
      interactive: true,
      trigger: "manual",
      placement: "right-start",
      theme: "bubble-menu padding-0 ",
      arrow: false,
      zIndex: 10
    });

    popupRef.current = popup[0]!;

    return () => {
      if (!popupRef.current) return;
      popupRef.current.destroy();
      // root.unmount();
    };
  }, [editor]);

  useEffect(() => {
    const handler = (event: MouseEvent) => {
      if (editor.isEditable) {
        const { selection } = editor.state;
        const parent = findParentNode(predicateIsTableCell)(selection);

        if (parent) {
          event?.preventDefault();
          toggleVisible();
        }
      }
    };

    window.addEventListener("contextmenu", handler);

    return () => {
      window.removeEventListener("contextmenu", handler);
    };
  }, [editor, toggleVisible]);

  return null;
};

export const TableCellMenuPlugin = (editor: Editor): Plugin<BubbleMenuPluginProps> => {
  const div = document.createElement("div");

  const root = createRoot(div)
  root.render(
    <TableCellMenu editor={editor} />
  )

  return BubbleMenuPlugin({
    pluginKey: "TableCellMenuPlugin",
    editor,
    element: div,
    tippyOptions: {
      appendTo: () => editor.options.element,
      duration: 200,
      animation: "shift-toward-subtle",
      moveTransition: "transform 0.2s ease-in-out",
      zIndex: 10,
      arrow: false,
      theme: "bubble-menu padding-0 hidden",
      getReferenceClientRect: () => {
        const { selection } = editor.state;

        const predicate = (node: PMNode) =>
          ["tableHeader", "tableCell"].includes(node.type.name);
        const parent = findParentNode(predicate)(selection);

        if (parent) {
          const rect = (editor.view.nodeDOM(
            parent?.pos
          ) as HTMLElement).getBoundingClientRect();
          return rect;
        }

        return posToDOMRect(editor.view, selection.from, selection.to);
      },
      position: "bottom",
    },
    shouldShow: (({ state, view }) => {
      const { selection } = state;
      const predicate = (node: PMNode) =>
        ["tableHeader", "tableCell"].includes(node.type.name);
      const parent = findParentNode(predicate)(selection);
      return Boolean(parent) && view.editable;
    }) as BubbleMenuPluginProps["shouldShow"]
  } as BubbleMenuPluginProps);
};
