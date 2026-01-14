import React, { useCallback, useEffect, useRef, useState } from "react";
import { Editor, getMarkRange, posToDOMRect } from "@tiptap/core";
import { computePosition, flip, offset } from "@floating-ui/dom";

import { isMarkActive } from "../../../utilities/mark";
import { Link as LinkExtension } from "../link";
import { Input, cn, Button, Label } from "@kn/ui";
import { MarkType } from "@tiptap/pm/model";
import { ReactRenderer } from "@tiptap/react";

/**
 * URL validation helper
 */
const isValidUrl = (urlString: string): boolean => {
  if (!urlString) return false;
  try {
    // If no protocol, add https://
    const url = urlString.match(/^https?:\/\//i) ? urlString : `https://${urlString}`;
    new URL(url);
    return true;
  } catch {
    return false;
  }
};

/**
 * Normalize URL by adding protocol if missing
 */
const normalizeUrl = (url: string): string => {
  if (!url) return '';
  return url.match(/^https?:\/\//i) ? url : `https://${url}`;
};

interface LinkEditProps {
  editor: Editor;
  onOk?: () => void;
  onCancel?: () => void;
  className?: string;
}

export const LinkEdit: React.FC<LinkEditProps> = ({ editor, onOk, onCancel, className }) => {
  const textInputRef = useRef<HTMLInputElement>(null);
  const hrefInputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [href, setHref] = useState("");
  const [start, setStart] = useState<number>(0);
  const [end, setEnd] = useState<number>(0);
  const [error, setError] = useState<string>("");

  // Initialize form with existing link data or selection
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
      );

      if (!range) return;

      setStart(range.from);
      setEnd(range.to);
      const attrs = editor.getAttributes(LinkExtension.name);
      setText(state.doc.textBetween(range.from, range.to));
      setHref(attrs.href || "");
    }
  }, [editor]);

  const ok = useCallback(() => {
    // Validate inputs
    if (!text.trim()) {
      setError("Link text cannot be empty");
      textInputRef.current?.focus();
      return;
    }

    if (!href.trim()) {
      setError("URL cannot be empty");
      hrefInputRef.current?.focus();
      return;
    }

    if (!isValidUrl(href)) {
      setError("Please enter a valid URL");
      hrefInputRef.current?.focus();
      return;
    }

    const normalizedHref = normalizeUrl(href);
    const { view } = editor;
    const schema = view.state.schema;
    const node = schema.text(text, [
      (schema.marks.link as MarkType).create({
        href: normalizedHref,
        target: '_blank',
        rel: 'noopener noreferrer nofollow'
      })
    ]);

    view.dispatch(view.state.tr.deleteRange(start, end));
    view.dispatch(view.state.tr.insert(start, node));
    view.dispatch(view.state.tr.scrollIntoView());
    editor.chain().focus().run();
    onOk?.();
  }, [text, href, start, end, editor, onOk]);

  // Auto focus on text input
  useEffect(() => {
    const timer = setTimeout(() => {
      textInputRef.current?.focus();
    }, 100);

    return () => clearTimeout(timer);
  }, []);

  // Handle keyboard shortcuts
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      ok();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      editor.chain().focus().run();
      onCancel?.();
    }
  }, [ok, editor, onCancel]);

  return (
    <div
      style={{ width: 320, zIndex: 1000 }}
      className={cn("flex flex-col gap-3 bg-popover text-popover-foreground p-3 rounded-md border shadow-md", className)}
      onKeyDown={handleKeyDown}
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="text-input" className="text-sm font-medium">
          Link Text
        </Label>
        <Input
          id="text-input"
          ref={textInputRef}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setError("");
          }}
          placeholder="Enter link text"
          className="h-9"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="href-input" className="text-sm font-medium">
          URL
        </Label>
        <Input
          id="href-input"
          ref={hrefInputRef}
          value={href}
          onChange={(e) => {
            setHref(e.target.value);
            setError("");
          }}
          placeholder="https://example.com"
          className="h-9"
        />
      </div>

      {error && (
        <p className="text-xs text-destructive">{error}</p>
      )}

      <div className="flex gap-2 justify-end">
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            editor.chain().focus().run();
            onCancel?.();
          }}
        >
          Cancel
        </Button>
        <Button size="sm" onClick={ok}>
          Confirm
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        Press Enter to confirm, Esc to cancel
      </p>
    </div>
  );
};

/**
 * Show link editor dialog at cursor position
 */
export const showLinkEditor = (editor: Editor): void => {
  const cleanup = () => {
    try {
      component.destroy();
      if (document.body.contains(component.element)) {
        document.body.removeChild(component.element);
      }
    } catch (error) {
      console.error('Error cleaning up link editor:', error);
    }
  };

  const component = new ReactRenderer(LinkEdit, {
    editor,
    props: {
      editor,
      onOk: cleanup,
      onCancel: cleanup
    }
  });

  component.render();
  document.body.appendChild(component.element);

  const { selection } = editor.state;
  const { view } = editor;
  const domRect = posToDOMRect(view, selection.from, selection.to);

  const virtualElement = {
    getBoundingClientRect: () => domRect,
    getClientRects: () => [domRect],
  };

  computePosition(virtualElement, component.element as HTMLElement, {
    placement: 'bottom-start',
    middleware: [
      offset(8),
      flip({ padding: 8 })
    ],
  }).then(({ x, y, strategy }) => {
    const element = component.element as HTMLElement;
    element.style.position = strategy;
    element.style.left = `${x}px`;
    element.style.top = `${y}px`;
    element.style.zIndex = '1000';
  });
};
