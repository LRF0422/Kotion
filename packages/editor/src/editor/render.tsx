import React, {
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
    width = 'w-[calc(100vw-350px)]'
  } = props;

  const [exts] = useEditorExtension(undefined, withTitle)
  const [items, setItems] = useSafeState<any[]>([])
  const [tocVisible, setTocVisible] = useSafeState(false)

  const editor = useEditor(
    {
      content: content ? rewriteUnknownContent(content as JSONContent,
        getSchema([...(exts as AnyExtension[] || []), ...(extensions as AnyExtension[] || [])]), {
        fallbackToParagraph: true
      }).json : { type: 'doc', content: [{ type: 'paragraph' }] },
      editable: isEditable,
      extensions: [
        ...(extensions as AnyExtension[] || []),
        ...(exts as AnyExtension[] || []),
        TableOfContents.configure({
          onUpdate(content) {
            setItems(content)
          },
          getIndex: getHierarchicalIndexes,
          // scrollParent: () => window,
        }),
      ],
      onBlur: ({ editor }) => { onBlur && onBlur(editor) },
      editorProps: {
        attributes: {
          class: "ProseMirror",
          spellcheck: "false",
          suppressContentEditableWarning: "true",
        }
      }
    },
    []
  );

  useImperativeHandle(ref, () => editor as Editor, [editor]);

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
            </StyledEditor>
          </div>
          {/* ToC - fixed position */}
          {toc && (
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
                  "fixed top-[60px] right-0 w-[300px] h-[calc(100vh-80px)] border-l bg-background z-40 transition-transform duration-300",
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
