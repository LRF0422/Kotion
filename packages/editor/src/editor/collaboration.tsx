import React, { ReactNode, forwardRef, useEffect, useImperativeHandle } from "react";
import { AnyExtension, Editor, JSONContent, getSchema } from "@tiptap/core";

import { EditorRenderProps } from "./render";
import { TiptapCollabProvider } from "@hocuspocus/provider";
import { EditorContent, useEditor } from "@tiptap/react";
import { useEditorExtension } from "./use-extension";
import { ThemeProvider } from "styled-components";
import light from "../styles/theme";
import { StyledEditor } from "../styles/editor";
import { ExtensionWrapper } from "@kn/common";
import { useSafeState, useUnmount } from "ahooks";
import { ToC } from "./ToC";
import { cn } from "@kn/ui";
import { EditorMenu } from "./EditorMenu";
import { PageContext, PageContextProps } from "./context";
import { rewriteUnknownContent } from "./rewriteUnknowContent";
import { TableOfContents, getHierarchicalIndexes } from "@editor/extensions";


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
      // @ts-ignore
      onDelete: ({ editor, node, from, newFrom, partial }) => {
       if (!partial) {
         console.log('deleted node', node);
         
       }
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
        // Collaboration.configure({
        //   document: provider.document
        // }),
        // CollaborationCursor.configure({
        //   provider: provider,
        //   user: {
        //     ...user,
        //     color: getUserColor()
        //   }
        // }),
      ],
      // onCreate({ editor: currentEditor }) {
      //   if (!provider.document.getMap('config').get('initialContentLoaded')) {
      //     provider.document.getMap('config').set('initialContentLoaded', true)
      //     console.log('content', content);
      //     if (currentEditor.isEmpty) {
      //       currentEditor.commands.setContent(content as Content)
      //     }
      //   }
      // },
      onTransaction: (transaction) => {
        console.debug("selection", transaction.editor.state.selection);

      },
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


  useUnmount(() => {
    if (provider) {
      console.log('disconnect');
      provider.document.getMap('config').set('initialContentLoaded', false)
      provider.disconnect()
      provider.destroy()
    }
  })
  useImperativeHandle(ref, () => editor as Editor)

  return (editor &&
    <PageContext.Provider value={pageInfo as PageContextProps}>
      <ThemeProvider theme={light}>
        <div className={cn("grow z-30", width)}>
          <EditorMenu editor={editor} extensionWrappers={extensionWrappers as ExtensionWrapper[]} />
          <div className={cn("w-full", props.className)} id="editor-container">
            <div className="flex relative w-full">
              <StyledEditor className="w-full grow overflow-auto h-full">
                <EditorContent editor={editor} className=" min-h-[600px]" />
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
