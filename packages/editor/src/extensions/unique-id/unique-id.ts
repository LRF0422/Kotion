import { Extension, findChildren, findChildrenInRange } from "@tiptap/core";
import { v4 as uuidv4 } from "uuid";


import combineTransactionSteps from "./utilities/combine-transaction-steps";
import getChangedRanges from "./utilities/get-changed-ranges";
import findDuplicates from "./utilities/find-duplicates";
import { Plugin, PluginKey, Transaction } from "@tiptap/pm/state";
import { Fragment, Node, Slice } from "@tiptap/pm/model";

export interface UniqueIDOptions {
  attributeName: string;
  types: string[];
  generateID: () => any;
  filterTransaction: ((transaction: Transaction) => boolean) | null;
}

export const UniqueID = Extension.create<UniqueIDOptions>({
  name: "uniqueID",
  // Must run before other extensions that depend on the id attribute being
  // present (BlockRank priority 900, DirtyTracker priority 50).
  priority: 10000,

  addOptions() {
    return {
      attributeName: "id",
      types: [],
      generateID: () => uuidv4(),
      filterTransaction: null
    };
  },

  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          [this.options.attributeName]: {
            default: null,
            parseHTML: element =>
              element.getAttribute(`data-${this.options.attributeName}`),
            renderHTML: attributes => {
              if (!attributes[this.options.attributeName]) {
                return {};
              }

              return {
                [`data-${this.options.attributeName}`]: attributes[
                  this.options.attributeName
                ]
              };
            }
          }
        }
      }
    ];
  },

  // Check initial content for missing ids AND remove duplicate-id blocks.
  //
  // Missing ids: nodes that were inserted without an id (e.g. setContent
  // from REST content before the extension could assign one).
  //
  // Duplicate ids: a known consequence of the Yjs seeding race condition in
  // CollaborationEditor — when REST content is seeded into a Y.Doc that is
  // about to receive server-synced content, the merged CRDT keeps both copies,
  // each carrying the same blockId. The duplicates are TOP-LEVEL blocks (the
  // entire page content tree was duplicated). Deleting all but the first
  // occurrence of each blockId cleans up the Y.Doc — the deletion propagates
  // through y-prosemirror to the collaboration server, healing the room for
  // all connected clients.
  onCreate() {
    const { view, state } = this.editor;
    const { tr, doc } = state;
    const { types, attributeName, generateID } = this.options;

    // ── Pass 1: assign missing ids ──
    const nodesWithoutId = findChildren(doc, node => {
      return (
        types.includes(node.type.name) && node.attrs[attributeName] === null
      );
    });

    nodesWithoutId.forEach(({ node, pos }) => {
      tr.setNodeMarkup(pos, undefined, {
        ...node.attrs,
        [attributeName]: generateID()
      });
    });

    // ── Pass 2: delete duplicate top-level blocks ──
    // Walk doc's direct children (top-level blocks). If a blockId was already
    // seen, the block is a duplicate created by the Yjs seeding race and must
    // be removed. Using `doc.forEach` (not `findChildren`) ensures we only
    // look at depth-0 children — nested duplicates are removed with their
    // parent. Deleting from end-to-start keeps earlier positions valid.
    const seenIds = new Set<string>();
    const positionsToDelete: { from: number; to: number }[] = [];
    const docAfterPass1 = tr.doc;
    docAfterPass1.forEach((node, offset) => {
      if (!types.includes(node.type.name)) return;
      const id = node.attrs[attributeName] as string | null;
      if (id === null) return;
      if (seenIds.has(id)) {
        positionsToDelete.push({ from: offset, to: offset + node.nodeSize });
      } else {
        seenIds.add(id);
      }
    });

    // Delete in reverse document order so earlier positions stay valid.
    positionsToDelete.sort((a, b) => b.from - a.from);
    for (const { from, to } of positionsToDelete) {
      tr.delete(from, to);
    }

    if (tr.steps.length) {
      tr.setMeta("addToHistory", false);
      view.dispatch(tr);
    }
  },

  addProseMirrorPlugins() {
    let dragSourceElement: Element | null = null;
    let transformPasted = false;

    return [
      new Plugin({
        key: new PluginKey("uniqueID"),

        appendTransaction: (transactions, oldState, newState) => {
          const docChanges =
            transactions.some(transaction => transaction.docChanged) &&
            !oldState.doc.eq(newState.doc);
          const filterTransactions =
            this.options.filterTransaction &&
            transactions.some(tr => !this.options.filterTransaction?.(tr));

          if (!docChanges || filterTransactions) {
            return;
          }

          const { tr } = newState;
          const { types, attributeName, generateID } = this.options;
          // @ts-ignore
          const transform = combineTransactionSteps(oldState.doc, transactions);
          const { mapping } = transform;

          // get changed ranges based on the old state
          const changes = getChangedRanges(transform);

          changes.forEach(change => {
            const newRange = {
              from: change.newStart,
              to: change.newEnd
            };

            const newNodes = findChildrenInRange(
              newState.doc,
              newRange,
              node => {
                return types.includes(node.type.name);
              }
            );

            const newIds = newNodes
              .map(({ node }) => node.attrs[attributeName])
              .filter(id => id !== null);

            const duplicatedNewIds = findDuplicates(newIds);

            newNodes.forEach(({ node, pos }) => {
              // instead of checking `node.attrs[attributeName]` directly
              // we look at the current state of the node within `tr.doc`.
              // this helps to prevent adding new ids to the same node
              // if the node changed multiple times within one transaction

              const id = tr.doc.nodeAt(pos)?.attrs[attributeName];

              if (id === null) {
                tr.setNodeMarkup(pos, undefined, {
                  ...node.attrs,
                  [attributeName]: generateID()
                });

                return;
              }

              // check if the node doesn’t exist in the old state
              const { deleted } = mapping.invert().mapResult(pos);
              const newNode = deleted && duplicatedNewIds.includes(id);

              if (newNode) {
                tr.setNodeMarkup(pos, undefined, {
                  ...node.attrs,
                  [attributeName]: generateID()
                });
              }
            });
          });

          if (!tr.steps.length) {
            return;
          }

          return tr;
        },

        // we register a global drag handler to track the current drag source element
        view(view) {
          const handleDragstart = (event: DragEvent) => {
            dragSourceElement = view.dom.parentElement?.contains(
              event.target as Element
            )
              ? view.dom.parentElement
              : null;
          };

          window.addEventListener("dragstart", handleDragstart);

          return {
            destroy() {
              window.removeEventListener("dragstart", handleDragstart);
            }
          };
        },

        props: {
          // @ts-ignore
          handleDOMEvents: {
            drop: (view, event) => {
              if (
                dragSourceElement !== view.dom.parentElement ||
                event.dataTransfer?.effectAllowed === "copy"
              ) {
                dragSourceElement = null;
                transformPasted = true;
              }

              return false;
            },
            // always create new ids on pasted content
            paste: () => {
              transformPasted = true;

              return false;
            }
          },

          // we’ll remove ids for every pasted node
          // so we can create a new one within `appendTransaction`
          transformPasted: slice => {
            if (!transformPasted) {
              return slice;
            }

            const { types, attributeName } = this.options;
            const removeId = (fragment: Fragment): Fragment => {
              const list: Node[] = [];

              fragment.forEach(node => {
                // don’t touch text nodes
                if (node.isText) {
                  list.push(node);

                  return;
                }

                // check for any other child nodes
                if (!types.includes(node.type.name)) {
                  list.push(node.copy(removeId(node.content)));

                  return;
                }

                // remove id
                const nodeWithoutId = node.type.create(
                  {
                    ...node.attrs,
                    [attributeName]: null
                  },
                  removeId(node.content),
                  node.marks
                );
                list.push(nodeWithoutId);
              });

              return Fragment.from(list);
            };

            // reset check
            transformPasted = false;

            return new Slice(
              removeId(slice.content),
              slice.openStart,
              slice.openEnd
            );
          }
        }
      })
    ];
  }
});
