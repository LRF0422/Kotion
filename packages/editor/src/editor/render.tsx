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
import { loadContentProgressive, isLargeDocument } from "./loadContentProgressive";
import { TableOfContents, getHierarchicalIndexes } from "@editor/extensions";
import { useSafeState } from "ahooks";
import { List, X, Loader2 } from "@kn/icon";

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
  const [loadProgress, setLoadProgress] = useSafeState(0)
  const [isLargeDoc, setIsLargeDoc] = useSafeState(false)

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
    setLoadProgress(0);
    setIsLargeDoc(false);

    // Yield first so the skeleton UI can paint before heavy processing begins
    const timer = setTimeout(async () => {
      if (cancelled) return;

      // Process content to remove unknown nodes/marks (lightweight)
      const processedContent = rewriteUnknownContent(
        content as JSONContent,
        getSchema(allExtensions as AnyExtension[]),
        { fallbackToParagraph: true },
      ).json;

      if (!processedContent || cancelled) return;

      // For very large documents, load in chunks so the browser stays
      // responsive and we can show progress. Otherwise use the fast path.
      if (isLargeDocument(processedContent)) {
        setIsLargeDoc(true);
        await loadContentProgressive(editor, processedContent, {
          chunkSize: 40,
          onProgress: (p) => { if (!cancelled) setLoadProgress(p); },
          isCancelled: () => cancelled,
        });
      } else {
        editor.commands.setContent(processedContent, { emitUpdate: false });
        if (!cancelled) setLoadProgress(100);
      }

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
                <div className="space-y-3 p-4">
                  {isLargeDoc && (
                    <div className="flex flex-col items-center gap-2 py-4">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>正在加载大文档，请稍候... {loadProgress}%</span>
                      </div>
                      <div className="w-full max-w-md h-1.5 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full bg-primary transition-all duration-200"
                          style={{ width: `${loadProgress}%` }}
                        />
                      </div>
                    </div>
                  )}
                  <div className="space-y-3 animate-pulse">
                    <div className="h-8 bg-muted rounded w-3/4" />
                    <div className="h-4 bg-muted rounded w-full" />
                    <div className="h-4 bg-muted rounded w-5/6" />
                    <div className="h-4 bg-muted rounded w-full" />
                    <div className="h-32 bg-muted rounded w-full" />
                    <div className="h-4 bg-muted rounded w-4/5" />
                  </div>
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
