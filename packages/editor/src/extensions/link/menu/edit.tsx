import React, { useCallback, useEffect, useRef, useState } from "react";
import { Editor, getMarkRange, posToDOMRect } from "@tiptap/core";
import tippy, { Instance } from "tippy.js";
import { ThemeProvider } from "styled-components";

import { isMarkActive } from "../../../utilities/mark";
import { Link as LinkExtension } from "../link";
import { getEditorTheme } from "../../../editor/theme";
import { Input } from "@repo/ui";
import { createRoot } from "react-dom/client";
import { Button } from "@repo/ui";
import { Label } from "@repo/ui";
import { MarkType } from "@tiptap/pm/model";

export const LinkEdit: React.FC<{
  text: string;
  href: string;
  onOk: (arg: { text: string; href: string }) => void;
  onCancel: () => void;
}> = ({ text: defaultText, href: defaultHref, onOk, onCancel }) => {
  const linkInputRef = useRef<any>(null);
  const [text, setText] = useState(defaultText);
  const [href, setHref] = useState(defaultHref);

  const ok = useCallback(() => {
    onOk &&
      onOk({
        text: text || href,
        href
      });
  }, [onOk, text, href]);

  useEffect(() => {
    const timer = setTimeout(() => {
      linkInputRef.current?.focus();
    }, 200);

    return () => {
      clearTimeout(timer);
    };
  }, []);

  return (
    <div style={{ width: 280 }} className="flex flex-col gap-2 bg-popover text-popover-foreground p-2 rounded-sm">
      <Label htmlFor="label">标题</Label>
      <Input id="label" defaultValue={text} onChange={(e) => setText(e.target.value)} />
      <Label htmlFor="link">链接</Label>
      <Input id="link" defaultValue={href} onChange={(e) => setHref(e.target.value)} />
      <div className="flex gap-2">
        <Button size="sm" onClick={ok}>确认</Button>
        <Button variant="secondary" size="sm">取消</Button>
      </div>
    </div>
  );
};

export const showLinkEditor = (editor: Editor, dom?: HTMLElement) => {
  const { view, state } = editor;
  const isInLink = isMarkActive(state.schema.marks.link as MarkType)(state);
  const selection = state.selection;

  let start: number;
  let end: number;
  let text;
  let href;

  if (!isInLink) {
    const { from, to } = selection;
    start = from;
    end = to;
    text = state.doc.textBetween(start, end);
    href = "";
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

    start = range.from;
    end = range.to;

    const attrs = editor.getAttributes(LinkExtension.name);
    text = state.doc.textBetween(start, end);
    href = attrs.href;
  }

  const div = document.createElement("div");
  div.className = "bubble-menu";
  let popup: Instance[];

  const root = createRoot(div)
  root.render(
    <LinkEdit
      text={text}
      href={href}
      onOk={values => {
        const { view } = editor;
        const schema = view.state.schema;
        const node = schema.text(values.text, [
          (schema.marks.link as MarkType).create({ href: values.href })
        ]);
        view.dispatch(view.state.tr.deleteRange(start, end));
        view.dispatch(view.state.tr.insert(start, node));
        view.dispatch(view.state.tr.scrollIntoView());
        popup?.[0]?.hide();
        editor
          .chain()
          .focus()
          .run();
      }}
      onCancel={() => {
        popup?.[0]?.hide();
        editor
          .chain()
          .focus()
          .run();
      }}
    />
  )

  popup = tippy("body", {
    getReferenceClientRect: () =>
      dom ? dom.getBoundingClientRect() : posToDOMRect(editor.view, start, end),
    appendTo: () => editor.options.element,
    content: div,
    showOnCreate: true,
    interactive: true,
    trigger: "manual",
    placement: "bottom-start",
    theme: "",
    arrow: false,
  });
};
