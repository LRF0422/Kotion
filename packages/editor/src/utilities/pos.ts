import { Editor } from "@tiptap/core";
import { EditorState, TextSelection } from "@tiptap/pm/state";

/**
 * 根据文档内容大小获取不越界的位置
 * @param state
 * @param pos
 * @returns
 */
export function safePos(state: EditorState, pos: number) {
  const max = Math.max(pos, 0);
  const min = Math.min(state.doc.content.size, max);
  return min;
}


export function scrollToPos(editor: Editor, pos: number) {
  const tr = editor.state.tr
  tr.setSelection(new TextSelection(tr.doc.resolve(pos)))
    .scrollIntoView()

  editor.view.dispatch(tr)
}