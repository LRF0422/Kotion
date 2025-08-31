import React, { useCallback, useEffect, useRef, useState } from "react";
import { Editor, getMarkRange, posToDOMRect } from "@tiptap/core";
import { computePosition, flip } from "@floating-ui/dom";

import { isMarkActive } from "../../../utilities/mark";
import { Link as LinkExtension } from "../link";
import { Input, cn } from "@kn/ui";
import { Button } from "@kn/ui";
import { Label } from "@kn/ui";
import { MarkType } from "@tiptap/pm/model";
import { ReactRenderer } from "@tiptap/react";

export const LinkEdit: React.FC<{
  editor: Editor;
  onOk?: () => void;
  onCancel?: () => void;
  className?: string;
}> = ({ editor, onOk, onCancel, className }) => {
  const linkInputRef = useRef<any>(null);
  const ref = useRef<HTMLDivElement>(null);
  const [text, setText] = useState("");
  const [href, setHref] = useState("");
  const [start, setStart] = useState<number>(0)
  const [end, setEnd] = useState<number>(0)

  useEffect(() => {
    const { state } = editor;
    const selection = state.selection;
    const isInLink = isMarkActive(editor.state.schema.marks.link as MarkType)(editor.state);

    if (!isInLink) {
      const { from, to } = selection;
      setStart(from);
      setEnd(to);
      setText(state.doc.textBetween(from, to));
      setHref("");
    } else {
      const { from } = editor.state.selection;
      const range = getMarkRange(
        editor.state.doc.resolve(from),
        editor.state.schema.marks.link as MarkType
      ) as {
        from: number;
        to: number;
      };

      if (!range) return;

      setStart(range.from)
      setEnd(range.to)
      const attrs = editor.getAttributes(LinkExtension.name);
      setText(state.doc.textBetween(range.from, range.to));
      setHref(attrs.href);
    }

  }, [])

  const ok = useCallback(() => {
    const { view } = editor;
    const schema = view.state.schema;
    const node = schema.text(text, [
      (schema.marks.link as MarkType).create({ href: href })
    ]);
    view.dispatch(view.state.tr.deleteRange(start, end));
    view.dispatch(view.state.tr.insert(start, node));
    view.dispatch(view.state.tr.scrollIntoView());
    editor
      .chain()
      .focus()
      .run();
    onOk && onOk();
  }, [text, href]);

  useEffect(() => {
    const timer = setTimeout(() => {
      linkInputRef.current?.focus();
    }, 200);

    return () => {
      clearTimeout(timer);
    };
  }, []);

  return (
    <div style={{ width: 280, zIndex: 1000 }}
      ref={ref}
      className={cn("flex flex-col gap-2 bg-popover text-popover-foreground p-2 rounded-sm border shadow-sm", className)}>
      <Label htmlFor="label">标题</Label>
      <Input id="label" defaultValue={text} onChange={(e) => setText(e.target.value)} />
      <Label htmlFor="link">链接</Label>
      <Input id="link" defaultValue={href} onChange={(e) => setHref(e.target.value)} />
      <div className="flex gap-2">
        <Button size="sm" onClick={ok}>确认</Button>
        <Button variant="secondary" size="sm" onClick={() => {
          editor
            .chain()
            .focus()
            .run();
          onCancel && onCancel()
        }}>取消</Button>
      </div>
    </div>
  );
};

export const showLinkEditor = (editor: Editor) => {
  const component = new ReactRenderer(LinkEdit, {
    editor,
    props: {
      editor,
      onOk: () => {
        component.destroy()
        document.body.removeChild(component.element)
      },
      onCancel: () => {
        component.destroy()
        document.body.removeChild(component.element)
      }
    }
  })
  component.render()
  document.body.appendChild(component.element)

  const { selection } = editor.state
  const { view } = editor
  const domRect = posToDOMRect(view, selection.from, selection.to)

  const virtualElement = {
    getBoundingClientRect: () => domRect,
    getClientRects: () => [domRect],
  }

  computePosition(virtualElement, (component.element as HTMLElement), {
    placement: 'bottom',
    middleware: [flip()],
  }).then(({ x, y, strategy }) => {
    (component.element as HTMLElement).style.zIndex = '1000';
    (component.element as HTMLElement).style.left = `${x + 650}px`;
    (component.element as HTMLElement).style.top = `${y}px`;
    (component.element as HTMLElement).style.position = strategy
  })
};
