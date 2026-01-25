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
import { cn, useIsMobile, useTheme, Button } from "@kn/ui";
import { EditorMenu } from "./EditorMenu";
import { PageContext, PageContextProps } from "./context";
import { rewriteUnknownContent } from "./rewriteUnknowContent";
import { TableOfContents, getHierarchicalIndexes } from "@editor/extensions";
import Collaboration from "@tiptap/extension-collaboration";
import CollaborationCursor from "@tiptap/extension-collaboration-caret";
import { List, X } from "@kn/icon";
import "../styles/editor.css"


export interface CollaborationEditorProps extends EditorRenderProps {
  token: string;
  header?: ReactNode,
  footer?: ReactNode,
  user: any,
  className?: string
  onStatus?: (status: any) => void
  provider?: TiptapCollabProvider
  synced?: boolean
  onAwarenessUpdate?: (users: { clientId: number; user: { nickName: string } }[]) => void;
  /**
   * External extensions to use instead of current user's plugins.
   * When provided, these extensions will be used instead of loading from pluginManager.
   * Useful for collaboration scenarios where invitee should use inviter's plugins.
   */
  externalExtensions?: ExtensionWrapper[];
}

// const MemorizedToC = React.memo(ToC)

export const CollaborationEditor = forwardRef<
  Editor | null,
  React.PropsWithChildren<CollaborationEditorProps>
>((props, ref) => {
  const { content, user, provider, pageInfo, toc, withTitle, width = 'w-[calc(100vw-350px)]', externalExtensions } = props

  const [extensions, extensionWrappers] = useEditorExtension(undefined, withTitle, externalExtensions)
  const [items, setItems] = useSafeState<any[]>([])
  const [tocVisible, setTocVisible] = useSafeState(true)


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
          render: (user) => {
            const cursor = document.createElement('span');
            cursor.classList.add('collaboration-carets__caret');

            const label = document.createElement('div');
            label.classList.add('collaboration-carets__label');
            label.style.backgroundColor = user.color;

            // Create avatar element if avatar URL exists
            if (user.avatar) {
              const avatar = document.createElement('img');
              avatar.classList.add('collaboration-carets__avatar');
              avatar.src = user.avatar;
              avatar.alt = user.name || 'User';
              label.appendChild(avatar);
            }

            // Create name text element
            const nameSpan = document.createElement('span');
            nameSpan.classList.add('collaboration-carets__name');
            nameSpan.textContent = user.name || 'Anonymous';
            label.appendChild(nameSpan);

            cursor.appendChild(label);
            return cursor;
          },
        }),
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
        <div className={cn("flex flex-col z-30 relative", width, props.className)}>
          {!isMobile && <EditorMenu editor={editor} extensionWrappers={extensionWrappers as ExtensionWrapper[]} />}
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



CollaborationEditor.displayName = "CollaborationEditor";
