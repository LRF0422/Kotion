import { Mark } from "@tiptap/core";
import { EditorState } from "@tiptap/pm/state";
import { MarkType } from "@tiptap/pm/model";

export const isMarkActive = (type: MarkType) => (
  state: EditorState
): boolean => {
  if (!type) {
    return false;
  }

  const { from, $from, to, empty } = state.selection;

  return !!(empty
    ? type.isInSet(state.storedMarks || $from.marks())
    : state.doc.rangeHasMark(from, to, type));
};

export function findMarkPosition(
  state: EditorState,
  mark: Mark,
  from: number,
  to: number
) {
  let markPos = { start: -1, end: -1 };

  state.doc.nodesBetween(from, to, (node, pos) => {
    if (markPos.start > -1) {
      return false;
    }
    if (markPos.start === -1 && node.marks.map(it => it.type.name).includes(mark.name)) {
      markPos = {
        start: pos,
        end: pos + Math.max(node.textContent.length, 1)
      };
    }
  });

  return markPos;
}
