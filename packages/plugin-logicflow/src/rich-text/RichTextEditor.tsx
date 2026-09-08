import {
  EditorContent,
  StyledEditor,
  type AnyExtension,
  type Editor,
  useEditor,
  useEditorExtension,
} from "@kn/editor";
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
} from "@kn/icon";
import {
  Button,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@kn/ui";
import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
} from "react";
import type { JSONContent, RichCardContent } from "../model/types";
import { sanitizeJSONContent } from "../model/rich-text";
import {
  createDefaultRichCardContent,
  sanitizeRichCardContent,
} from "./rich-card-content";

const ALLOWED_EXTENSIONS = new Set([
  "doc",
  "paragraph",
  "text",
  "undoRedo",
  "history",
  "heading",
  "bold",
  "italic",
  "link",
  "bulletList",
  "orderedList",
  "listItem",
  "hardBreak",
  "color",
  "textStyle",
  "textAlign",
]);

export interface RichTextEditorHandle {
  getJSON(): RichCardContent;
  setJSON(content: RichCardContent): void;
  flush(): void;
  focus(field?: "title" | "body"): void;
}

export interface RichTextEditorProps {
  content?: RichCardContent;
  onChange: (content: RichCardContent) => void;
  disabled?: boolean;
  debounceMs?: number;
  className?: string;
  ariaLabel?: string;
}

function sameContent(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function editorDocument(editor: Editor | null): JSONContent {
  return sanitizeJSONContent(editor?.getJSON());
}

export const RichTextEditor = forwardRef<
  RichTextEditorHandle,
  RichTextEditorProps
>(function RichTextEditor(
  {
    content = createDefaultRichCardContent(),
    onChange,
    disabled = false,
    debounceMs = 300,
    className,
    ariaLabel = "Rich card content",
  },
  ref,
) {
  const [allExtensions] = useEditorExtension("trailingNode");
  const extensions = useMemo(
    () =>
      (allExtensions as AnyExtension[]).filter((extension) =>
        ALLOWED_EXTENSIONS.has(extension.name),
      ),
    [allExtensions],
  );
  const initialContentRef = useRef(sanitizeRichCardContent(content));
  const valueRef = useRef(initialContentRef.current);
  const onChangeRef = useRef(onChange);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const titleFocusedRef = useRef(false);
  const bodyFocusedRef = useRef(false);
  const activeEditorRef = useRef<Editor | null>(null);
  const titleEditorRef = useRef<Editor | null>(null);
  const bodyEditorRef = useRef<Editor | null>(null);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const readEditors = useCallback((): RichCardContent => {
    const next = sanitizeRichCardContent({
      title: editorDocument(titleEditorRef.current),
      body: editorDocument(bodyEditorRef.current),
    });
    valueRef.current = next;
    return next;
  }, []);

  const flush = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    const next = readEditors();
    onChangeRef.current(next);
  }, [readEditors]);

  const schedule = useCallback(() => {
    readEditors();
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(
      () => {
        timeoutRef.current = null;
        onChangeRef.current(valueRef.current);
      },
      Math.max(0, debounceMs),
    );
  }, [debounceMs, readEditors]);

  const onFocus = useCallback((field: "title" | "body", editor: Editor) => {
    if (field === "title") titleFocusedRef.current = true;
    else bodyFocusedRef.current = true;
    activeEditorRef.current = editor;
  }, []);

  const onBlur = useCallback(
    (field: "title" | "body") => {
      if (field === "title") titleFocusedRef.current = false;
      else bodyFocusedRef.current = false;
      queueMicrotask(() => {
        if (!titleFocusedRef.current && !bodyFocusedRef.current) flush();
      });
    },
    [flush],
  );

  const titleEditor = useEditor(
    {
      extensions,
      content: initialContentRef.current.title,
      editable: !disabled,
      editorProps: {
        attributes: {
          class:
            "min-h-11 px-3 py-2 text-base font-semibold text-foreground outline-none",
          "aria-label": `${ariaLabel} title`,
          spellcheck: "true",
        },
      },
      onCreate: ({ editor }) => {
        titleEditorRef.current = editor;
      },
      onFocus: ({ editor }) => onFocus("title", editor),
      onBlur: () => onBlur("title"),
      onUpdate: schedule,
    },
    [extensions],
  );

  const bodyEditor = useEditor(
    {
      extensions,
      content: initialContentRef.current.body,
      editable: !disabled,
      editorProps: {
        attributes: {
          class: "min-h-24 px-3 py-2 text-sm text-foreground outline-none",
          "aria-label": `${ariaLabel} body`,
          spellcheck: "true",
        },
      },
      onCreate: ({ editor }) => {
        bodyEditorRef.current = editor;
        activeEditorRef.current = editor;
      },
      onFocus: ({ editor }) => onFocus("body", editor),
      onBlur: () => onBlur("body"),
      onUpdate: schedule,
    },
    [extensions],
  );

  useEffect(() => {
    titleEditorRef.current = titleEditor;
    bodyEditorRef.current = bodyEditor;
    if (!activeEditorRef.current) activeEditorRef.current = bodyEditor;
  }, [bodyEditor, titleEditor]);

  useEffect(() => {
    titleEditor?.setEditable(!disabled);
    bodyEditor?.setEditable(!disabled);
  }, [bodyEditor, disabled, titleEditor]);

  useEffect(() => {
    if (titleFocusedRef.current || bodyFocusedRef.current) return;
    const next = sanitizeRichCardContent(content);
    valueRef.current = next;
    if (titleEditor && !sameContent(titleEditor.getJSON(), next.title)) {
      titleEditor.commands.setContent(next.title, { emitUpdate: false });
    }
    if (bodyEditor && !sameContent(bodyEditor.getJSON(), next.body)) {
      bodyEditor.commands.setContent(next.body, { emitUpdate: false });
    }
  }, [bodyEditor, content, titleEditor]);

  useEffect(
    () => () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
        onChangeRef.current(valueRef.current);
      }
    },
    [],
  );

  useImperativeHandle(
    ref,
    () => ({
      getJSON: readEditors,
      setJSON: (nextContent) => {
        const next = sanitizeRichCardContent(nextContent);
        valueRef.current = next;
        titleEditor?.commands.setContent(next.title, { emitUpdate: false });
        bodyEditor?.commands.setContent(next.body, { emitUpdate: false });
      },
      flush,
      focus: (field = "body") =>
        (field === "title" ? titleEditor : bodyEditor)?.commands.focus(),
    }),
    [bodyEditor, flush, readEditors, titleEditor],
  );

  const run = (command: (editor: Editor) => void) => {
    const editor = activeEditorRef.current ?? bodyEditor ?? titleEditor;
    if (editor && !disabled) command(editor);
  };

  const toolbarButton = (
    label: string,
    icon: React.ReactNode,
    command: (editor: Editor) => void,
  ) => (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="h-11 w-11 shrink-0"
      aria-label={label}
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => run(command)}
    >
      {icon}
    </Button>
  );

  return (
    <div
      className={`rounded-lg border border-border bg-card text-card-foreground ${className ?? ""}`}
    >
      <div className="flex min-h-11 flex-wrap items-center gap-0.5 border-b border-border px-1">
        {toolbarButton("Bold", <Bold className="h-4 w-4" />, (editor) =>
          editor.chain().focus().toggleBold().run(),
        )}
        {toolbarButton("Italic", <Italic className="h-4 w-4" />, (editor) =>
          editor.chain().focus().toggleItalic().run(),
        )}
        {toolbarButton("Bullet list", <List className="h-4 w-4" />, (editor) =>
          editor.chain().focus().toggleBulletList().run(),
        )}
        {toolbarButton(
          "Numbered list",
          <ListOrdered className="h-4 w-4" />,
          (editor) => editor.chain().focus().toggleOrderedList().run(),
        )}
        {toolbarButton("Link", <LinkIcon className="h-4 w-4" />, (editor) => {
          const current = editor.getAttributes("link").href as
            | string
            | undefined;
          const href = window.prompt("Link URL", current ?? "https://");
          if (href === null) return;
          if (!href.trim()) editor.chain().focus().unsetLink().run();
          else
            editor
              .chain()
              .focus()
              .extendMarkRange("link")
              .setLink({ href: href.trim() })
              .run();
        })}
        <label
          className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-md hover:bg-accent"
          title="Text color"
        >
          <span className="sr-only">Text color</span>
          <input
            type="color"
            className="h-6 w-6 cursor-pointer rounded border-0 bg-transparent p-0"
            disabled={disabled}
            onChange={(event) =>
              run((editor) =>
                editor.chain().focus().setColor(event.target.value).run(),
              )
            }
          />
        </label>
        <Select
          disabled={disabled}
          onValueChange={(value) =>
            run((editor) =>
              editor
                .chain()
                .focus()
                .setMark("textStyle", { fontSize: value })
                .run(),
            )
          }
        >
          <SelectTrigger className="h-11 w-[5.5rem]" aria-label="Font size">
            <SelectValue placeholder="Size" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem className="h-11" value="12px">
              12 px
            </SelectItem>
            <SelectItem className="h-11" value="14px">
              14 px
            </SelectItem>
            <SelectItem className="h-11" value="16px">
              16 px
            </SelectItem>
            <SelectItem className="h-11" value="20px">
              20 px
            </SelectItem>
          </SelectContent>
        </Select>
        {toolbarButton(
          "Align left",
          <AlignLeft className="h-4 w-4" />,
          (editor) => editor.chain().focus().setTextAlign("left").run(),
        )}
        {toolbarButton(
          "Align center",
          <AlignCenter className="h-4 w-4" />,
          (editor) => editor.chain().focus().setTextAlign("center").run(),
        )}
        {toolbarButton(
          "Align right",
          <AlignRight className="h-4 w-4" />,
          (editor) => editor.chain().focus().setTextAlign("right").run(),
        )}
        {toolbarButton(
          "Justify",
          <AlignJustify className="h-4 w-4" />,
          (editor) => editor.chain().focus().setTextAlign("justify").run(),
        )}
      </div>
      <div>
        <Label className="sr-only">Title</Label>
        <StyledEditor className="border-b border-border bg-transparent p-0">
          <EditorContent editor={titleEditor} />
        </StyledEditor>
      </div>
      <div>
        <Label className="sr-only">Body</Label>
        <StyledEditor className="bg-transparent p-0">
          <EditorContent editor={bodyEditor} />
        </StyledEditor>
      </div>
    </div>
  );
});
