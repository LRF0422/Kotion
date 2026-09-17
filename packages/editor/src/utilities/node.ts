import { Editor, NodeRange, objectIncludes } from "@tiptap/core";
import { EditorState, NodeSelection } from "@tiptap/pm/state";
import { Node } from "@tiptap/pm/model";
import { NodeType, ResolvedPos, Schema } from "@tiptap/pm/model";

export function getCurrentNode(state: EditorState): Node | null {
  const $head = state.selection.$head;
  // state.selection.$anchor
  let node: Node | null = null;

  for (let d = $head.depth; d > 0; d--) {
    node = $head.node(d);
  }


  if ($head) {
    let depth = state.selection.$anchor.pos
    while (!$head.node(depth)) {
      node = $head.node(depth)
      depth--
    }
  }

  return node;
}

export function getNodeAtPos(state: EditorState, pos: number): Node | null {
  const $head = state.doc.resolve(pos);
  let node: Node | null = null;

  for (let d = $head.depth; d > 0; d--) {
    node = $head.node(d);
  }

  return node;
}


export function isNodeActivePro(
  state: EditorState,
  typeOrName: NodeType | string | null,
  attributes: Record<string, any> = {},
): boolean {
  const { from, to } = state.selection
  // const type = typeOrName ? getNodeType(typeOrName, state.schema) : null

  const nodeRanges: NodeRange[] = []

  state.doc.nodesBetween(from, to, (node, pos) => {
    if (node.isText) {
      return
    }

    const relativeFrom = Math.max(from, pos)
    const relativeTo = Math.min(to, pos + node.nodeSize)

    nodeRanges.push({
      node,
      from: relativeFrom,
      to: relativeTo,
    })
  })

  // const selectionRange = to - from
  const matchedNodeRanges = nodeRanges
    .filter(nodeRange => objectIncludes(nodeRange.node.attrs, attributes, { strict: false }))
  let currentNode: any
  matchedNodeRanges.forEach(it => {
    if (it.from <= state.selection.$anchor.pos && it.to >= state.selection.$anchor.pos && it.node.type.name !== "paragraph") {
      currentNode = it.node
    }
  })
  return currentNode && currentNode.type.name === typeOrName;
}


export function isInCustomNode(state: EditorState, nodeName: string): boolean {
  if (!state.schema.nodes[nodeName]) return false;

  const $head = state.selection.$head;
  for (let d = $head.depth; d > 0; d--) {
    if ($head.node(d).type === state.schema.nodes[nodeName]) {
      return true;
    }
  }
  return false;
}

export function isInCodeBlock(state: EditorState): boolean {
  return isInCustomNode(state, "codeBlock");
}

export function isInTitle(state: EditorState): boolean {
  if (state?.selection?.$head?.pos === 0) return true;
  return isInCustomNode(state, "title");
}

export function isInCallout(state: EditorState): boolean {
  return isInCustomNode(state, "callout");
}

export function isTitleNode(node: Node): boolean {
  return node && node.type.name === "title";
}

export function isBulletListNode(node: Node): boolean {
  return node && node.type.name === "bulletList";
}

export function isOrderedListNode(node: Node): boolean {
  return node && node.type.name === "orderedList";
}

export function isTodoListNode(node: Node): boolean {
  return node && node.type.name === "taskList";
}

export function isListNode(node: Node): boolean {
  return (
    isBulletListNode(node) || isOrderedListNode(node) || isTodoListNode(node)
  );
}

export const findNodeByBlockId = (
  state: EditorState,
  blockId: string,
  nodeType?: string,
): { node: Node; pos: number } | null => {
  let target: Node | null = null;
  let pos = -1;

  state.doc.nodesBetween(0, state.doc.content.size, (node, p) => {
    // Top-level blocks carry their id in `attrs.id`; fall back to `attrs.blockId`.
    const id = (node.attrs.id ?? node.attrs.blockId) as string | undefined;
    if (id === blockId) {
      target = node;
      pos = p;
      return true;
    }

    return false;
  });

  return target ? { node: target, pos } : null;
};

/**
 * Find ALL nodes matching a blockId (not just the first). Duplicate blockIds
 * can appear when a Yjs seeding race condition merges REST content on top of
 * server-synced content — every duplicate is a separate Yjs node that happens
 * to share the same id attribute. `findNodeByBlockId` stops at the first match
 * and would silently leave the others behind, so deletion and other
 * id-keyed mutations must use this variant when they need to be exhaustive.
 */
export const findAllNodesByBlockId = (
  state: EditorState,
  blockId: string,
): { node: Node; pos: number }[] => {
  const results: { node: Node; pos: number }[] = [];

  state.doc.nodesBetween(0, state.doc.content.size, (node, p) => {
    const id = (node.attrs.id ?? node.attrs.blockId) as string | undefined;
    if (id === blockId) {
      results.push({ node, pos: p });
    }
    return false;
  });

  return results;
};

/**
 * Find multiple nodes by their blockIds in a single document traversal.
 * Returns a map of blockId → { node, pos } for all found nodes.
 */
export const findNodesByBlockIds = (
  state: EditorState,
  blockIds: string[],
): Map<string, { node: Node; pos: number }> => {
  const idSet = new Set(blockIds);
  const results = new Map<string, { node: Node; pos: number }>();

  state.doc.nodesBetween(0, state.doc.content.size, (node, p) => {
    const id = (node.attrs.id ?? node.attrs.blockId) as string | undefined;
    if (id && idSet.has(id)) {
      results.set(id, { node, pos: p });
      // Stop early if all found
      if (results.size === idSet.size) return true;
    }
    return false;
  });

  return results;
};

export const isListActive = (editor: Editor) => {
  return editor.isActive('bulletList') || editor.isActive('orderedList') || editor.isActive('taskList');
};

export type ListKind = 'bulletList' | 'orderedList' | 'taskList';

/** Item node type each list kind holds. */
const LIST_ITEM_TYPE: Record<ListKind, string> = {
  bulletList: 'listItem',
  orderedList: 'listItem',
  taskList: 'taskItem',
};

/**
 * The list node enclosing the current selection, if any, plus its position
 * (the position *before* the list node).
 */
export function locateList(
  doc: Node,
  $from: ResolvedPos,
): { node: Node; pos: number; depth: number } | null {
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth);
    if (isListNode(node)) return { node, pos: $from.before(depth), depth };
  }
  return null;
}

/** The list node enclosing the current selection, if any. */
export function findParentList(
  editor: Editor,
): { node: Node; pos: number } | null {
  return locateList(editor.state.doc, editor.state.selection.$from);
}

/**
 * Rebuild `list` as `target`, converting every item node
 * (`listItem` <-> `taskItem`) and preserving id/rank attrs. Returns null when
 * the schema doesn't provide the target list/item types.
 */
export function buildConvertedList(
  schema: Schema,
  list: Node,
  target: ListKind,
): Node | null {
  const targetListType = schema.nodes[target];
  const targetItemType = schema.nodes[LIST_ITEM_TYPE[target]];
  if (!targetListType || !targetItemType) return null;

  const items: Node[] = [];
  list.forEach(item => {
    const attrs: Record<string, any> = { ...item.attrs };
    if (targetItemType.name === 'taskItem') attrs.checked = Boolean(attrs.checked);
    else delete attrs.checked;
    items.push(targetItemType.create(attrs, item.content, item.marks));
  });

  return targetListType.create({ ...list.attrs }, items, list.marks);
}

/**
 * Convert the list enclosing the current selection between bullet / ordered /
 * task lists.
 *
 * Tiptap's `toggleList` only re-types the list node when its existing items are
 * valid for the new list type. `listItem` and `taskItem` are different node
 * types, so that check always fails for task lists and a plain
 * `toggleTaskList()` inside a normal list is a no-op (and vice versa). This
 * rebuilds the list and its items atomically instead.
 *
 * - When the active list already is `target`, the selected item is lifted,
 *   matching the toggle-off behaviour of `toggleBulletList` / `toggleTaskList`.
 * - Otherwise the whole list is re-typed in one transaction (one undo step);
 *   item attributes (id/rank) survive and `checked` is preserved across
 *   task-item conversions.
 * - Outside any list it falls back to Tiptap's own wrap command, so converting
 *   a plain paragraph still works.
 */
export function convertListType(editor: Editor, target: ListKind): boolean {
  const current = findParentList(editor);
  const itemName = LIST_ITEM_TYPE[target];

  if (!current) {
    switch (target) {
      case 'bulletList':
        return editor.chain().focus().toggleBulletList().run();
      case 'orderedList':
        return editor.chain().focus().toggleOrderedList().run();
      case 'taskList':
        return editor.chain().focus().toggleTaskList().run();
      default:
        return false;
    }
  }

  if (current.node.type.name === target) {
    return editor.chain().focus().liftListItem(itemName).run();
  }

  const { node: list, pos } = current;
  const converted = buildConvertedList(editor.state.schema, list, target);
  if (!converted) return false;

  return editor
    .chain()
    .focus()
    .command(({ tr }) => {
      tr.replaceWith(pos, pos + list.nodeSize, converted);
      return true;
    })
    .run();
}
