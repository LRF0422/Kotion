import React, { ReactNode, forwardRef, useImperativeHandle, useEffect, useRef } from "react";
import { AnyExtension, Editor, JSONContent, getSchema } from "@tiptap/core";
import { Doc as YDoc, XmlFragment, XmlElement } from "yjs";
import * as Y from "yjs";

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
import Collaboration from "@tiptap/extension-collaboration";
import CollaborationCursor from "@tiptap/extension-collaboration-caret";
import "../styles/editor.css"


export interface CollaborationEditorProps extends EditorRenderProps {
  token: string;
  header?: ReactNode,
  footer?: ReactNode,
  user: any,
  className?: string
  onStatus?: (status: any) => void
  provider?: TiptapCollabProvider
  synced: boolean
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


  // Memoize user ref to avoid extension recreation
  const userRef = React.useRef(user);
  React.useEffect(() => {
    userRef.current = user;
  }, [user]);

  // Build extensions array with optional collaboration - only depends on provider, not user
  const editorExtensions = React.useMemo(() => {
    const baseExtensions = [
      ...extensions as AnyExtension[],
      TableOfContents.configure({
        onUpdate(content) {
          setItems(content)
        },
        getIndex: getHierarchicalIndexes,
      })
    ];

    // Add collaboration extensions if provider is available
    if (provider) {
      baseExtensions.push(
        Collaboration.configure({
          document: provider.document,
        }),
        CollaborationCursor.configure({
          provider: provider,
          user: userRef.current || { name: 'Anonymous', color: '#3b82f6' },
        })
      );
    }

    return baseExtensions;
  }, [extensions, provider, userRef]); // Include userRef to ensure user updates are captured

  const editor = useEditor(
    {
      editable: true,
      shouldRerenderOnTransaction: false,
      onBlur: ({ editor }) => {
        props.onBlur && props.onBlur(editor)
      },
      extensions: editorExtensions,
      editorProps: {
        attributes: {
          class: "ProseMirror",
          spellcheck: "false",
          suppressContentEditableWarning: "false",
        }
      }
    },
    [editorExtensions]
  );

  useImperativeHandle(ref, () => editor as Editor)

  // Handle content updates for non-collaborative mode - wait for editor to be ready
  React.useEffect(() => {
    if (editor) {
      console.log('initContent', content);
      const processedContent = rewriteUnknownContent(content as JSONContent,
        getSchema(extensions as AnyExtension[]), {
        fallbackToParagraph: true
      }).json;
      editor.commands.setContent(processedContent);
    }
  }, [editor]);


  // Cleanup provider on unmount
  useUnmount(() => {
    if (provider) {
      provider.disconnect();
    }
  });

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
