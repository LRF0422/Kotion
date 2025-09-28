import { Editor, NodeRange, objectIncludes } from "@tiptap/core";
import { EditorState, NodeSelection } from "@tiptap/pm/state";
import { Node } from "@tiptap/pm/model";
import { NodeType, Schema } from "@tiptap/pm/model";

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

// export function isNodeActive(editor: Editor, extensionName: string): boolean {
//   const selection = editor.state.selection;
//   const node =
//     ((selection as unknown) as NodeSelection)?.node ||
//     selection.$head.node(selection.$head.depth);

//   return node
//     ? node.type.name === extensionName
//     : editor.isActive(extensionName);
// }

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
    // if (node.type.name === nodeType) {
    if (node.attrs.id === blockId) {
      target = node;
      pos = p;
      return true;
    }

    return false;
    // } else {
    //   return false;
    // }
  });

  return target ? { node: target, pos } : null;
};

// export const isNodeEmpty = (node: Node) => {
//   if (node.isAtom && !node.isTextblock) return false;

//   return node.type.name === "paragraph" && node.nodeSize === 2;
// };

// export function getNodeType(nameOrType: string | NodeType, schema: Schema): NodeType {
//   if (typeof nameOrType === 'string') {
//     if (!schema.nodes[nameOrType]) {
//       throw Error(`There is no node type named '${nameOrType}'. Maybe you forgot to add the extension?`);
//     }

//     return schema.nodes[nameOrType] as NodeType;
//   }

//   return nameOrType;
// }

export const isListActive = (editor: Editor) => {
  return editor.isActive('bulletList') || editor.isActive('orderedList') || editor.isActive('taskList');
};
