import React, {
  ElementType,
  ReactNode,
  forwardRef,
  useImperativeHandle
} from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import { EditorKit } from "./kit";
import { EditorProvider } from "./provider";
import { AnyExtension, Content, Editor, JSONContent, getSchema } from "@tiptap/core";
import { ExtensionWrapper } from "@kn/common";
import { useEditorExtension } from "./use-extension";
import { resolveBlockMenuItems } from "./kit";
import { HocuspocusProvider } from "@hocuspocus/provider";
import { ThemeProvider } from "styled-components";
import light, { dark } from "../styles/theme";
import { StyledEditor } from "../styles/editor";
import { cn, useTheme, Button } from "@kn/ui";
import { ToC } from "./ToC";
import { PageContext, PageContextProps } from "./context";
import { rewriteUnknownContent } from "./rewriteUnknowContent";
import { TableOfContents, getHierarchicalIndexes } from "@editor/extensions";
import { useSafeState } from "ahooks";
import { List, X } from "@kn/icon";

export interface EditorRenderProps extends EditorProvider, EditorKit {
  content?: Content;
  extensionConfig?: ExtensionWrapper[];
  isEditable?: boolean;
  header?: ReactNode;
  footer?: ReactNode;
  id: string;
  offsetTop?: number,
  isColl?: boolean
  provider?: HocuspocusProvider,
  className?: string,
  toolbar?: boolean,
  width?: string,
  user?: any
  toc?: boolean
  pageInfo?: PageContextProps
  withTitle?: boolean
  onBlur?: (editor: Editor) => void
  /** Called when content has finished loading into the editor */
  onContentReady?: () => void;
}

export const EditorRender = forwardRef<
  Editor | null,
  React.PropsWithChildren<EditorRenderProps>
>((props, ref) => {
  const {
    content,
    extensions,
    isEditable,
    toc = true,
    pageInfo,
    withTitle = true,
    onBlur,
    width = 'w-[calc(100vw-350px)]',
    onContentReady,
  } = props;

  const [exts, extensionWrappers] = useEditorExtension(undefined, withTitle)
  const blockMenuItems = React.useMemo(() => resolveBlockMenuItems(extensionWrappers as ExtensionWrapper[]), [extensionWrappers])
  const [items, setItems] = useSafeState<any[]>([])
  const [tocVisible, setTocVisible] = useSafeState(false)
  const [contentReady, setContentReady] = useSafeState(false)

  const allExtensions = React.useMemo(() => [
    ...(extensions as AnyExtension[] || []),
    ...(exts as AnyExtension[] || []),
    TableOfContents.configure({
      onUpdate(content) {
        setItems(content)
      },
      getIndex: getHierarchicalIndexes,
    }),
  ], [extensions, exts]);

  const editor = useEditor(
    {
      content: { type: 'doc', content: [{ type: 'paragraph' }] },
      editable: isEditable,
      immediatelyRender: false,
      shouldRerenderOnTransaction: false,
      extensions: allExtensions,
      onBlur: ({ editor }) => { onBlur && onBlur(editor) },
      editorProps: {
        attributes: {
          class: "ProseMirror",
          spellcheck: "false",
          suppressContentEditableWarning: "true",
        }
      }
    },
    [allExtensions]
  );

  // Set block menu items into dragable extension storage
  React.useEffect(() => {
    if (editor) {
      // @ts-ignore
      editor.storage.dragable = { ...editor.storage.dragable, blockMenuItems }
    }
  }, [editor, blockMenuItems])

  useImperativeHandle(ref, () => editor as Editor, [editor]);

  // Load content into the editor
  React.useEffect(() => {
    if (!editor || !content) return;

    let cancelled = false;

    // Yield first so the skeleton UI can paint before heavy processing begins
    const timer = setTimeout(() => {
      if (cancelled) return;

      // Process content to remove unknown nodes/marks (lightweight)
      const processedContent = rewriteUnknownContent(
        content as JSONContent,
        getSchema(allExtensions as AnyExtension[]),
        { fallbackToParagraph: true },
      ).json;

      if (!processedContent || cancelled) return;

      // Load content all at once
      editor.commands.setContent(processedContent, { emitUpdate: false });

      if (!cancelled) {
        setContentReady(true);
        onContentReady?.();
      }
    }, 0);

    return () => { cancelled = true; clearTimeout(timer); };
  }, [editor, content, allExtensions]);

  // Get current theme from context
  const { theme: currentTheme } = useTheme();
  const selectedTheme = currentTheme === 'dark' ? dark : light;

  return (editor &&
    <PageContext.Provider value={pageInfo as PageContextProps}>
      <ThemeProvider theme={selectedTheme}>
        <div className={cn("flex flex-col z-30 relative", width, props.className)}>
          <div className="flex-1 min-h-0 w-full overflow-y-auto" id="editor-container">
            <StyledEditor>
              <EditorContent editor={editor} />
              {!contentReady && (
                <div className="space-y-3 p-4 animate-pulse">
                  <div className="h-8 bg-muted rounded w-3/4" />
                  <div className="h-4 bg-muted rounded w-full" />
                  <div className="h-4 bg-muted rounded w-5/6" />
                  <div className="h-4 bg-muted rounded w-full" />
                  <div className="h-32 bg-muted rounded w-full" />
                  <div className="h-4 bg-muted rounded w-4/5" />
                </div>
              )}
            </StyledEditor>
          </div>
          {/* Render bubble menus (e.g., comment read-only popup) */}
          {editor && extensionWrappers?.map((wrapper, idx) => {
            if (!wrapper.bubbleMenu) return null;
            const menus: ElementType[] = Array.isArray(wrapper.bubbleMenu) ? wrapper.bubbleMenu : [wrapper.bubbleMenu];
            return menus.map((Menu, j) => (
              <Menu key={`render-bubble-${idx}-${j}`} editor={editor} />
            ));
          })}
          {/* ToC - fixed position */}
          {toc && contentReady && (
            <>
              {/* Toggle button */}
              <Button
                variant="outline"
                size="icon"
                className={cn(
                  "fixed z-50 top-[100px] shadow-md bg-background",
                  tocVisible ? "right-[310px]" : "right-4"
                )}
                onClick={() => setTocVisible(!tocVisible)}
              >
                {tocVisible ? <X className="h-4 w-4" /> : <List className="h-4 w-4" />}
              </Button>
              {/* ToC panel */}
              <div
                className={cn(
                  "fixed top-[80px] right-0 w-[300px] h-[calc(100vh-80px)] border-l bg-background z-40 transition-transform duration-300",
                  tocVisible ? "translate-x-0" : "translate-x-full"
                )}
              >
                <ToC editor={editor} items={items} />
              </div>
            </>
          )}
        </div>
      </ThemeProvider >
    </PageContext.Provider>
  );
});

EditorRender.displayName = "EditorRender";
