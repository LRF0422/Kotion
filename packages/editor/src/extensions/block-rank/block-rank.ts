import { Extension } from "@tiptap/core";
import { Plugin, PluginKey, Transaction } from "@tiptap/pm/state";
import { Node as ProseMirrorNode } from "@tiptap/pm/model";

import { keyBetween } from "../../utilities/fractional-index";

export interface BlockRankOptions {
  /** Attribute that stores the fractional rank. */
  attributeName: string;
  /** Node types that may appear at the document top level. */
  types: string[];
  /** Skip transactions for which this returns false (e.g. remote/collab). */
  filterTransaction: ((transaction: Transaction) => boolean) | null;
}

/**
 * Assigns a fractional **rank** to each top-level block so document order can be
 * persisted without renumbering siblings. Inserting/splitting/moving a block
 * only re-ranks that block (a key strictly between its new neighbours) — every
 * other block keeps its rank, so the save touches O(changed) blocks, not O(N).
 *
 * The rank lives in `attrs.rank` and is serialised with the block. The backend
 * sorts top-level blocks by this key and, for blocks that don't have one yet
 * (legacy data), derives an equivalent key from the old integer `sort_order` —
 * so this is migration-free.
 *
 * Mirrors the structure of the `UniqueID` extension. Only depth-1 nodes are
 * ranked; nested children keep their `sort_order`-based ordering.
 */
export const BlockRank = Extension.create<BlockRankOptions>({
  name: "blockRank",
  // Run after UniqueID (priority 1000) so a freshly-inserted block already has
  // its id when we rank it.
  priority: 900,

  addOptions() {
    return {
      attributeName: "rank",
      types: [],
      filterTransaction: null,
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
                ],
              };
            },
          },
        },
      },
    ];
  },

  // Seed ranks for any top-level block missing one (e.g. a brand-new document).
  onCreate() {
    const { state, view } = this.editor;
    const { tr } = state;
    if (applyRankFixups(null, state.doc, tr, this.options.attributeName)) {
      view.dispatch(tr);
    }
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("blockRank"),
        appendTransaction: (transactions, oldState, newState) => {
          const docChanges =
            transactions.some(transaction => transaction.docChanged) &&
            !oldState.doc.eq(newState.doc);
          const filtered =
            this.options.filterTransaction &&
            transactions.some(tr => !this.options.filterTransaction?.(tr));
          if (!docChanges || filtered) {
            return;
          }

          const { tr } = newState;
          if (applyRankFixups(oldState.doc, newState.doc, tr, this.options.attributeName)) {
            return tr;
          }
          return undefined;
        },
      }),
    ];
  },
});

interface TopBlock {
  pos: number;
  node: ProseMirrorNode;
  rank: string | null;
}

function setRank(tr: Transaction, attr: string, cur: TopBlock, rank: string) {
  tr.setNodeMarkup(cur.pos, undefined, { ...cur.node.attrs, [attr]: rank });
  cur.rank = rank;
}

/**
 * Assign ranks so top-level blocks are in a strictly increasing rank order,
 * touching as few blocks as possible. Returns true if any markup changed.
 *
 * Pass 1 (O(changed)): give a rank to any block missing one, and re-rank a block
 * whose **node identity changed** (inserted/moved) when its rank no longer sits
 * strictly between its neighbours — so a single insert/move rewrites only that
 * one block. Edited-in-place blocks keep their (still-valid) rank.
 *
 * Pass 2 (rare): if the result is somehow not strictly increasing (e.g. several
 * blocks moved in one transaction), fall back to a left→right repair so order is
 * always correct.
 *
 * `oldDoc == null` (onCreate) treats every block as changed, which only assigns
 * ranks where missing since already-valid ranks stay between their neighbours.
 */
function applyRankFixups(
  oldDoc: ProseMirrorNode | null,
  doc: ProseMirrorNode,
  tr: Transaction,
  attr: string,
): boolean {
  const tops: TopBlock[] = [];
  doc.forEach((node, offset) => {
    tops.push({ pos: offset, node, rank: (node.attrs[attr] ?? null) as string | null });
  });
  if (tops.length === 0) return false;

  const oldRefs = new Set<ProseMirrorNode>();
  if (oldDoc) oldDoc.forEach(n => oldRefs.add(n));

  let changed = false;

  // ── Pass 1 — local fixups only ──
  for (let i = 0; i < tops.length; i++) {
    const cur = tops[i];
    const prevRank = i > 0 ? tops[i - 1].rank : null;
    const nextRank = i < tops.length - 1 ? tops[i + 1].rank : null;
    const isNew = !oldRefs.has(cur.node);
    const between =
      cur.rank != null &&
      (prevRank == null || prevRank < cur.rank) &&
      (nextRank == null || cur.rank < nextRank);
    if (cur.rank == null || (isNew && !between)) {
      setRank(tr, attr, cur, keyBetween(prevRank, nextRank));
      changed = true;
    }
  }

  // ── Pass 2 — guarantee a strict total order (rare) ──
  let monotonic = true;
  for (let i = 1; i < tops.length; i++) {
    if (!(tops[i - 1].rank! < tops[i].rank!)) {
      monotonic = false;
      break;
    }
  }
  if (!monotonic) {
    let prev: string | null = null;
    for (let i = 0; i < tops.length; i++) {
      const cur = tops[i];
      if (cur.rank != null && (prev == null || cur.rank > prev)) {
        prev = cur.rank;
        continue;
      }
      let nextRank: string | null = null;
      for (let j = i + 1; j < tops.length; j++) {
        const r = tops[j].rank;
        if (r != null && (prev == null || r > prev)) {
          nextRank = r;
          break;
        }
      }
      setRank(tr, attr, cur, keyBetween(prev, nextRank));
      prev = cur.rank;
      changed = true;
    }
  }

  return changed;
}
