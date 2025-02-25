import React, { ReactNode, forwardRef, useImperativeHandle } from "react";
import { AnyExtension, Content, Editor } from "@tiptap/core";

import { EditorRenderProps } from "./render";
import { TiptapCollabProvider } from "@hocuspocus/provider";
import { Collaboration } from "@tiptap/extension-collaboration";
import { CollaborationCursor } from "@tiptap/extension-collaboration-cursor"
import { getUserColor } from "./utilities";
import { EditorContent, useEditor } from "@tiptap/react";
import { useEditorExtension } from "./use-extension";
import TableOfContents, { getHierarchicalIndexes } from "@tiptap-pro/extension-table-of-contents";
import { ThemeProvider } from "styled-components";
import light from "../styles/theme";
import { StyledEditor } from "../styles/editor";
import { ExtensionWrapper } from "@repo/common";
import { MenuIcon, Sparkles } from "@repo/icon";
import { useSafeState, useUnmount } from "ahooks";
import { ToC } from "./ToC";
import { cn } from "@repo/ui";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@repo/ui";
import { EditorMenu } from "./EditorMenu";
import { PageContext } from "./context";


export interface CollaborationEditorProps extends EditorRenderProps {
  token: string;
  header?: ReactNode,
  footer?: ReactNode,
  user: any,
  className?: string
  onStatus?: (status: any) => void
  provider: TiptapCollabProvider
  onAwarenessUpdate?: (users: { clientId: number; user: { nickName: string } }[]) => void;
}

const MemorizedToC = React.memo(ToC)

export const CollaborationEditor = forwardRef<
  Editor | null,
  React.PropsWithChildren<CollaborationEditorProps>
>((props, ref) => {
  const { content, user, provider, pageInfo, toc } = props

  const [tableOfContents, setTableOfContents] = useSafeState<any[]>()
  const [extensions, extensionWrappers] = useEditorExtension()



  const editor = useEditor(
    {
      editable: true,
      immediatelyRender: true,
      shouldRerenderOnTransaction: false,
      extensions: [
        ...extensions as AnyExtension[],
        Collaboration.configure({
          document: provider.document
        }),
        CollaborationCursor.configure({
          provider: provider,
          user: {
            ...user,
            color: getUserColor()
          }
        }),
        TableOfContents.configure({
          getIndex: getHierarchicalIndexes,
          onUpdate: (data) => {
            setTableOfContents(data)
          }
        }),
      ],
      onCreate({ editor: currentEditor }) {
        if (!provider.document.getMap('config').get('initialContentLoaded')) {
          provider.document.getMap('config').set('initialContentLoaded', true)
          console.log('content', content);
          if (currentEditor.isEmpty) {
            currentEditor.commands.setContent(content as Content)
          }
        }
      },
      editorProps: {
        attributes: {
          class: "magic-editor",
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

  return (editor && tableOfContents &&
    <PageContext.Provider value={pageInfo}>
      <ThemeProvider theme={light}>
        <div className={cn("flex flex-col w-[calc(100vw-350px)] grow z-30")}>
          <EditorMenu editor={editor} extensionWrappers={extensionWrappers as ExtensionWrapper[]} />
          <div className={cn("w-full", props.className)} >
            <div className="flex relative w-full ">
              <StyledEditor className="w-full grow">
                <EditorContent editor={editor} />
              </StyledEditor>
              {
                toc && <div className={cn("border-l w-[300px] sticky top-0 right-0 box-border", props.className)}>
                  <Tabs defaultValue="toc">
                    <TabsList>
                      <TabsTrigger value="toc"><MenuIcon className="h-4 w-4" /></TabsTrigger>
                      <TabsTrigger value="ai"><Sparkles className="h-4 w-4" /></TabsTrigger>
                    </TabsList>
                  </Tabs>
                </div>
              }
            </div>
          </div>
        </div>
      </ThemeProvider >
    </PageContext.Provider>
  );
});



CollaborationEditor.displayName = "CollaborationEditor";
