import React, { ReactNode, forwardRef, useImperativeHandle } from "react";
import { AnyExtension, Editor, JSONContent, getSchema } from "@tiptap/core";

import { EditorRenderProps } from "./render";
import { TiptapCollabProvider } from "@hocuspocus/provider";
import { EditorContent, useEditor } from "@tiptap/react";
import { useEditorExtension } from "./use-extension";
import { resolveBlockMenuItems } from "./kit";
import { ThemeProvider } from "styled-components";
import light, { dark } from "../styles/theme";
import { StyledEditor } from "../styles/editor";
import { ExtensionWrapper } from "@kn/common";
import { useSafeState, useUnmount } from "ahooks";
import { NotionToC } from "./NotionToC";
import { cn, useIsMobile, useTheme } from "@kn/ui";
import { EditorMenu } from "./EditorMenu";
import { MobileEditorToolbar } from "./MobileEditorToolbar";
import { PageHeader } from "./PageHeader";
import { PageContext, PageContextProps } from "./context";
import { rewriteUnknownContent } from "./rewriteUnknowContent";
import { loadContentProgressive, isLargeDocument } from "./loadContentProgressive";
import { TableOfContents, getHierarchicalIndexes } from "@editor/extensions";
import Collaboration from "@tiptap/extension-collaboration";
import CollaborationCursor from "@tiptap/extension-collaboration-caret";
import { Loader2 } from "@kn/icon";
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
  /** Called when content has finished loading into the editor */
  onContentReady?: () => void;
}


export const CollaborationEditor = forwardRef<
  Editor | null,
  React.PropsWithChildren<CollaborationEditorProps>
>((props, ref) => {
  const { content, user, provider, pageInfo, toc, withTitle, width = 'w-[calc(100vw-350px)]', externalExtensions, onContentReady } = props

  const [extensions, extensionWrappers] = useEditorExtension(undefined, withTitle, externalExtensions)
  const blockMenuItems = React.useMemo(() => resolveBlockMenuItems(extensionWrappers as ExtensionWrapper[]), [extensionWrappers])
  const [items, setItems] = useSafeState<any[]>([])
  const [contentReady, setContentReady] = useSafeState(false)
  const [loadProgress, setLoadProgress] = useSafeState(0)
  const [isLargeDoc, setIsLargeDoc] = useSafeState(false)

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
      immediatelyRender: false,
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

  // Set block menu items into dragable extension storage
  React.useEffect(() => {
    if (editor) {
      // @ts-ignore
      editor.storage.dragable = { ...editor.storage.dragable, blockMenuItems }
    }
  }, [editor, blockMenuItems])

  useImperativeHandle(ref, () => editor as Editor)

  // Load content into the editor
  //
  // When a Yjs collab provider is attached, the local Y.Doc is empty at
  // mount time and only acquires the page's collaborative state once the
  // server's SyncStep2 has been processed. Calling `setContent` BEFORE
  // that point is what produced the duplicate-content bug: the local
  // insert gets recorded by Yjs as fresh ops, then the server's own
  // state is layered on top of it during sync, leaving two copies of
  // every block in the merged document.
  //
  // Strategy:
  //   1. If there is no provider, behave as before — REST content is the
  //      single source of truth.
  //   2. If there is a provider, wait for `synced` to arrive (with a
  //      bounded timeout). After sync, only seed from REST when the
  //      collaborative doc is still empty (brand-new page, or never
  //      collaboratively edited). Otherwise the Yjs state already carries
  //      the latest content and we leave it alone.
  React.useEffect(() => {
    if (!editor) return;

    // New/empty pages have no content: mark ready immediately so the skeleton
    // does not remain visible forever.
    if (!content) {
      setLoadProgress(100);
      setIsLargeDoc(false);
      setContentReady(true);
      onContentReady?.();
      return;
    }

    let cancelled = false;
    setLoadProgress(0);
    setIsLargeDoc(false);

    const isCollabDocEmpty = (): boolean => {
      const doc = editor.state.doc;
      if (doc.childCount === 0) return true;
      // Walk every descendant looking for *real* content. Structural size
      // (e.g. an empty title containing an empty heading) is not enough:
      // Tiptap's default initialisation is exactly that shape, and so is a
      // Yjs sync that arrived with no payload yet, so relying on
      // `firstChild.content.size === 0` would misclassify those cases as
      // "non-empty" and skip the REST seed entirely (which is what made
      // the page render blank after a refresh).
      //
      // A node counts as content when it is either:
      //   - a text node with at least one non-whitespace character, or
      //   - an atom node that isn't text (images, embeds, hard breaks,
      //     custom inline atoms, etc.).
      let hasContent = false;
      doc.descendants((node) => {
        if (hasContent) return false;
        if (node.isText) {
          if (node.text && node.text.trim() !== '') {
            hasContent = true;
            return false;
          }
          return false;
        }
        if (node.isAtom) {
          hasContent = true;
          return false;
        }
        return true;
      });
      return !hasContent;
    };

    const waitForSync = (): Promise<boolean> => {
      if (!provider) return Promise.resolve(true);
      if (provider.synced) return Promise.resolve(true);
      return new Promise<boolean>((resolve) => {
        let settled = false;
        const handler = () => {
          if (settled) return;
          settled = true;
          provider.off('synced', handler);
          clearTimeout(timeoutId);
          resolve(true);
        };
        // Bounded wait — if the WS is unreachable we still want to surface
        // *something* rather than spin forever. 5s is generous for the
        // SyncStep2 round-trip while still bounding the worst case.
        const timeoutId = setTimeout(() => {
          if (settled) return;
          settled = true;
          provider.off('synced', handler);
          resolve(false);
        }, 5000);
        provider.on('synced', handler);
      });
    };

    // Yield first so the skeleton UI can paint before heavy processing begins
    const timer = setTimeout(async () => {
      if (cancelled) return;

      // Process content to remove unknown nodes/marks (lightweight)
      const processedContent = rewriteUnknownContent(
        content as JSONContent,
        getSchema(extensions as AnyExtension[]),
        { fallbackToParagraph: true },
      ).json;

      if (!processedContent || cancelled) return;

      const synced = await waitForSync();
      if (cancelled) return;

      // If sync succeeded and the collab doc already carries content,
      // trust Yjs as the source of truth and skip the REST seed —
      // calling setContent here would duplicate every block.
      if (synced && provider && !isCollabDocEmpty()) {
        setLoadProgress(100);
        setContentReady(true);
        onContentReady?.();
        return;
      }

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
  }, [editor, content, provider, extensions]);


  // Cleanup provider on unmount
  useUnmount(() => {
    if (provider) {
      provider.awareness?.destroy();
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
          {/* Mobile: keep bubble/floating menus (toolbar={false}) and add a
              keyboard-docked formatting toolbar in place of the hidden top bar. */}
          {isMobile && (
            <EditorMenu editor={editor} extensionWrappers={extensionWrappers as ExtensionWrapper[]} toolbar={false} />
          )}
          <div className="flex-1 min-h-0 w-full overflow-y-auto" id="editor-container">
            <StyledEditor>
              {contentReady && <PageHeader editor={editor} />}
              <EditorContent editor={editor} />
              {contentReady && (extensionWrappers as ExtensionWrapper[])
                .filter((w) => w.pageFooter)
                .map((w, i) => {
                  const Footer = w.pageFooter!;
                  return <Footer key={`page-footer-${w.name}-${i}`} editor={editor} />;
                })}
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
          {/* ToC - Notion-style floating outline on the right edge */}
          {toc && contentReady && (
            <NotionToC editor={editor} items={items} />
          )}
          {/* Mobile: formatting toolbar docked above the soft keyboard */}
          {isMobile && contentReady && (
            <MobileEditorToolbar editor={editor} extensionWrappers={extensionWrappers as ExtensionWrapper[]} />
          )}
        </div>
      </ThemeProvider >
    </PageContext.Provider>
  );
});



CollaborationEditor.displayName = "CollaborationEditor";
