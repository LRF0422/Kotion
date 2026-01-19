import React, { ReactNode, forwardRef, useEffect, useImperativeHandle } from "react";
import { AnyExtension, Editor, JSONContent, getSchema } from "@tiptap/core";

import { EditorRenderProps } from "./render";
import { TiptapCollabProvider } from "@hocuspocus/provider";
import { EditorContent, useEditor } from "@tiptap/react";
import { useEditorExtension } from "./use-extension";
import { ThemeProvider } from "styled-components";
import light, { dark } from "../styles/theme";
import { StyledEditor } from "../styles/editor";
import { ExtensionWrapper } from "@kn/common";
import { useSafeState, useUnmount } from "ahooks";
import { ToC } from "./ToC";
import { cn, useIsMobile, useTheme } from "@kn/ui";
import { EditorMenu } from "./EditorMenu";
import { PageContext, PageContextProps } from "./context";
import { rewriteUnknownContent } from "./rewriteUnknowContent";
import { TableOfContents, getHierarchicalIndexes } from "@editor/extensions";
import "../styles/editor.css"


export interface CollaborationEditorProps extends EditorRenderProps {
  token: string;
  header?: ReactNode,
  footer?: ReactNode,
  user: any,
  className?: string
  onStatus?: (status: any) => void
  provider?: TiptapCollabProvider
  onAwarenessUpdate?: (users: { clientId: number; user: { nickName: string } }[]) => void;
}

// const MemorizedToC = React.memo(ToC)

export const CollaborationEditor = forwardRef<
  Editor | null,
  React.PropsWithChildren<CollaborationEditorProps>
>((props, ref) => {
  const { content, user, provider, pageInfo, toc, withTitle, width = 'w-[calc(100vw-350px)]' } = props

  const [extensions, extensionWrappers] = useEditorExtension(undefined, withTitle)
  const [items, setItems] = useSafeState<any[]>([])


  useEffect(() => {

  }, [extensions])

  const editor: Editor = useEditor(
    {
      editable: true,
      content: content ? rewriteUnknownContent(content as JSONContent,
        getSchema(extensions as AnyExtension[]), {
        fallbackToParagraph: true
      }).json : null,
      immediatelyRender: true,
      shouldRerenderOnTransaction: false,
      onBlur: ({ editor }) => {
        props.onBlur && props.onBlur(editor)
      },
      extensions: [
        ...extensions as AnyExtension[],
        TableOfContents.configure({
          onUpdate(content) {
            setItems(content)
          },
          getIndex: getHierarchicalIndexes,
          // scrollParent: () => document.querySelector("#editor-container") as HTMLElement,
        })
      ],
      editorProps: {
        attributes: {
          class: "ProseMirror",
          spellcheck: "false",
          suppressContentEditableWarning: "false",
        }
      }
    },
    []
  );

  useImperativeHandle(ref, () => editor as Editor)

  // Get current theme from context
  const { theme: currentTheme } = useTheme();
  const selectedTheme = currentTheme === 'dark' ? dark : light;
  const isMobile = useIsMobile();

  return (editor &&
    <PageContext.Provider value={pageInfo as PageContextProps}>
      <ThemeProvider theme={selectedTheme}>
        <div className={cn("grow z-30", width)}>
          {!isMobile && <EditorMenu editor={editor} extensionWrappers={extensionWrappers as ExtensionWrapper[]} />}
          <div className={cn("w-full", props.className)} id="editor-container">
            <div className="flex relative w-full">
              <StyledEditor className="w-full grow overflow-auto h-full">
                <EditorContent editor={editor} className="h-full" />
              </StyledEditor>
              {
                toc && (<div className={cn("border-l w-[300px] sticky top-0 right-0 box-border h-full", props.className)}>
                  <ToC editor={editor} items={items} />
                </div>)
              }
            </div>
          </div>
        </div>
      </ThemeProvider >
    </PageContext.Provider>
  );
});



CollaborationEditor.displayName = "CollaborationEditor";
