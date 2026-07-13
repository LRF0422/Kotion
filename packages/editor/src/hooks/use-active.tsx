import { Editor } from '@tiptap/core';
import type { Transaction } from '@tiptap/pm/state';
import { useEffect, useState } from 'react';
import deepEqual from 'deep-equal';

function someEqual(sub: Record<string, unknown> | undefined, full: Record<string, unknown>) {
  if (!sub) return false;

  return Object.keys(sub).every(key => deepEqual(sub[key], full[key]));
}

export const useActive = (editor: Editor, name: string, attributes?: Record<string, unknown>) => {
  const [active, toggleActive] = useState(false);

  useEffect(() => {
    // Only re-evaluate when the doc or selection actually changed. Tiptap
    // dispatches meta-only transactions on every editor focus/blur (see
    // FocusEvents in @tiptap/core), and Radix Dialog / Sheet / DropdownMenu
    // steal focus when they open — so without this gate each menu open would
    // wake every `useActive`-backed toolbar button, twice.
    //
    // `transaction` already covers selection changes, so we no longer need a
    // separate `selectionUpdate` subscription (the previous double-listener
    // fired the same work twice per transaction).
    const listener = ({ transaction }: { transaction: Transaction }) => {
      if (!transaction.docChanged && !transaction.selectionSet) return;
      const selection = editor.state.selection;
      const node = selection.$head.node(selection.$head.depth);
      toggleActive(someEqual(attributes, node.attrs) || editor.isActive(name, attributes));
    };

    editor.on('transaction', listener);

    return () => {
      editor.off('transaction', listener);
    };
  }, [editor, name, attributes, toggleActive]);

  return active;
};
