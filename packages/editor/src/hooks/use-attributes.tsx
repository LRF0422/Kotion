import { Editor } from "@tiptap/core";
import type { Transaction } from "@tiptap/pm/state";
import deepEqual from "deep-equal";
import { useEffect, useRef, useState } from "react";

type MapFn<T, R> = (arg: T) => R;

function mapSelf<T>(d: T): T {
  return d;
}

export function useAttributes<T extends object, R = T>(
  editor: Editor,
  attribute: string,
  defaultValue?: T,
  map?: (arg: T) => R
) {
  const mapFn = (map || mapSelf) as MapFn<T, R>;
  const [value, setValue] = useState<R>(mapFn(defaultValue as T));
  const prevValueCache = useRef<R>(value);

  useEffect(() => {
    // Only re-evaluate when the doc or selection actually changed. Tiptap
    // dispatches meta-only transactions on every focus/blur, and Radix
    // modals steal focus on open — so without this gate every toolbar
    // button backed by `useAttributes` would run `getAttributes` +
    // deepEqual twice per menu open, once per subscription.
    //
    // `transaction` already covers selection changes, so the separate
    // `selectionUpdate` listener the old implementation carried was pure
    // duplication and has been removed.
    const listener = ({ transaction }: { transaction: Transaction }) => {
      if (!transaction.docChanged && !transaction.selectionSet) return;
      const attrs = {
        ...defaultValue,
        ...editor.getAttributes(attribute)
      } as T;
      Object.keys(attrs).forEach((key: string) => {
                // @ts-ignore
        if (attrs[key] === null || attrs[key] === undefined) {
          // @ts-ignore
          attrs[key] = defaultValue[key];
        }
      });
      const nextAttrs = mapFn(attrs);
      if (deepEqual(prevValueCache.current, nextAttrs)) {
        return;
      }
      setValue(nextAttrs);
      prevValueCache.current = nextAttrs;
    };

    editor.on("transaction", listener);

    return () => {
      editor.off("transaction", listener);
    };
  }, [editor, defaultValue, attribute, mapFn]);

  return value;
}
