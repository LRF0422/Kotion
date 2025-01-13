
import { Node } from "@tiptap/pm/model";
import {Selection} from "@tiptap/pm/state"
import { headingToPersistenceKey } from "./slug";
import { NodeWithPos } from "@tiptap/react";
import { findBlockNodes } from "prosemirror-utils";

export function findCollapsedNodes(doc: Node): NodeWithPos[] {
  const blocks = findBlockNodes(doc);
  const nodes: NodeWithPos[] = [];

  let withinCollapsedHeading;

  for (const block of blocks) {
    if (block.node.type.name === "heading") {
      if (
        !withinCollapsedHeading ||
        block.node.attrs.level <= withinCollapsedHeading
      ) {
        if (block.node.attrs.collapsed) {
          if (!withinCollapsedHeading) {
            withinCollapsedHeading = block.node.attrs.level;
          }
        } else {
          withinCollapsedHeading = undefined;
        }
        continue;
      }
    }

    if (withinCollapsedHeading) {
      nodes.push(block);
    }
  }

  return nodes;
}

export const handleFoldContent = (event: any, extension: any) => {
  event.preventDefault();

  const { view } = extension.storage.editor;
  const hadFocus = view.hasFocus();
  const { tr } = view.state;
  const { top, left } = event.target.getBoundingClientRect();
  const result = view.posAtCoords({ top, left });

  if (result) {
    const node = view.state.doc.nodeAt(result.inside);

    if (node) {
      const endOfHeadingPos = result.inside + node.nodeSize;
      const $pos = view.state.doc.resolve(endOfHeadingPos);
      const collapsed = !node.attrs.collapsed;

      if (collapsed && view.state.selection.to > endOfHeadingPos) {
        tr.setSelection(Selection.near($pos, -1));
      }

      const transaction = tr.setNodeMarkup(result.inside, undefined, {
        ...node.attrs,
        collapsed
      });

      const persistKey = headingToPersistenceKey(
        node,
        extension.storage.editor.options.editorProps.id
      );

      if (collapsed) {
        localStorage?.setItem(persistKey, "collapsed");
      } else {
        localStorage?.removeItem(persistKey);
      }

      view.dispatch(transaction);

      if (hadFocus) {
        view.focus();
      }
    }
  }
};
