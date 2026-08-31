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
import { ExtensionWrapper, logger, resolveService } from "@kn/common";
import type { PageDocumentOperations } from "@kn/common";
import { useSafeState } from "ahooks";
import { NotionToC } from "./NotionToC";
import { cn, useIsMobile, useTheme } from "@kn/ui";
import { EditorMenu } from "./EditorMenu";
import { MobileEditorToolbar } from "./MobileEditorToolbar";
import { EditorStatusBar } from "./EditorStatusBar";
import { ChangeTrackerBar } from "./ChangeTrackerBar";
import { PageHeader } from "./PageHeader";
import { PageContext } from "./context";
import { rewriteUnknownContent } from "./rewriteUnknowContent";
import { migratePluginContentInYDoc } from "./plugin-content-migration";
import { loadContentProgressive, isLargeDocument } from "./loadContentProgressive";
import { TableOfContents, getHierarchicalIndexes, MousePointerSync } from "@editor/extensions";
import Collaboration from "@tiptap/extension-collaboration";
import CollaborationCursor from "@tiptap/extension-collaboration-caret";
import { TiptapTransformer } from "@hocuspocus/transformer";
import * as Y from "yjs";
import { Loader2 } from "@kn/icon";
import "../styles/editor.css"


type PageSeedDocumentOperations = Pick<PageDocumentOperations, "claimPageSeed" | "releasePageSeed">;

export interface CollaborationEditorProps extends EditorRenderProps {
  token: string;
  header?: ReactNode,
  footer?: ReactNode,
  user: any,
  className?: string
  onStatus?: (status: any) => void
  provider?: TiptapCollabProvider
  /** Explicit document capability for collaborative seed arbitration. */
  pageDocuments?: PageSeedDocumentOperations
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
  /** Anchor the table of contents to this editor instead of the viewport. */
  tocContained?: boolean;
}

// The Yjs field the Collaboration extension binds to (its built-in default).
// Must match the field used when seeding the Y.Doc below.
const COLLAB_FIELD = "default";

/**
 * A collaborative Y.Doc is "empty" when its bound XML fragment has no nodes
 * at all. A brand-new page (content only ever lived in REST/DB) syncs down an
 * empty fragment; an already-collaboratively-edited page syncs down a populated
 * one. This is checked *after* sync so the fragment reflects the server state.
 */
const isYDocEmpty = (doc: Y.Doc): boolean => {
  try {
    return doc.getXmlFragment(COLLAB_FIELD).length === 0;
  } catch {
    return true;
  }
};

/**
 * Resolve once the provider has finished its initial sync (SyncStep2), or after
 * a bounded timeout so an unreachable WS still lets us surface *something*.
 */
const waitForProviderSync = (provider: TiptapCollabProvider, timeoutMs = 5000): Promise<boolean> => {
  if (provider.synced) return Promise.resolve(true);
  return new Promise<boolean>((resolve) => {
    let settled = false;
    const handler = () => {
      if (settled) return;
      settled = true;
      provider.off("synced", handler);
      clearTimeout(timeoutId);
      resolve(true);
    };
    const timeoutId = setTimeout(() => {
      if (settled) return;
      settled = true;
      provider.off("synced", handler);
      resolve(false);
    }, timeoutMs);
    provider.on("synced", handler);
  });
};

/**
 * Ask the server for the exclusive right to seed this page's Y.Doc from REST
 * content.
 *
 * `isYDocEmpty` alone is not enough to decide this. "Should I initialise this
 * document?" is a *distributed* decision, and an empty local fragment is
 * *local* state: two clients opening the same page concurrently both observe an
 * empty document (neither has received the other's update yet), both seed, and
 * Yjs merges rather than de-duplicates — so the page ends up with two copies of
 * every block, each carrying the same blockId. `OffscreenEditorHost` makes this
 * routine rather than rare: an AI agent editing a page the user has open is a
 * second client running exactly this logic in the same room.
 *
 * Failure posture is deliberately asymmetric:
 * - an explicit denial means another client is seeding, so we must NOT seed
 *   (its content arrives over the collaboration channel instead);
 * - a transport failure falls back to seeding, because refusing would render a
 *   blank document for a real page. That leaves the old race in place only for
 *   the window where the API is unreachable, rather than always.
 */
type SeedClaim = {
  granted: boolean;
  documents?: PageSeedDocumentOperations;
};

const claimSeedRight = async (
  explicitDocuments: PageSeedDocumentOperations | undefined,
  pageId: string,
  clientId: string,
): Promise<SeedClaim> => {
  let documents: PageSeedDocumentOperations | undefined;
  try {
    // Resolve lazily: editors without a provider, and populated collaborative
    // documents that need no seed, must not require a bound space-page service.
    documents = explicitDocuments ?? resolveService("spacePageService").documents;
    return {
      granted: await documents.claimPageSeed({ pageId, clientId }),
      documents,
    };
  } catch (e) {
    logger.warn("[CollaborationEditor] seed arbitration unavailable, seeding unarbitrated", e);
    return { granted: true, documents };
  }
};

const releaseSeedRight = (
  documents: PageSeedDocumentOperations | undefined,
  pageId: string,
  clientId: string,
): void => {
  if (!documents) return;
  try {
    void Promise.resolve(documents.releasePageSeed({ pageId, clientId }))
      .catch(() => { /* best-effort: the claim expires on its own */ });
  } catch {
    // Best effort: synchronous transport failures also leave the TTL as fallback.
  }
};


/**
 * Inner editor: owns the actual `useEditor` instance. By the time this mounts
 * the collaborative Y.Doc (if any) has already been seeded with content, so the
 * Collaboration extension initialises the editor straight from real content and
 * never has to materialise the schema's placeholder `title` node.
 */
interface CollaborationEditorInnerProps extends CollaborationEditorProps {
  extensions: AnyExtension[];
  extensionWrappers: ExtensionWrapper[];
}

const CollaborationEditorInner = forwardRef<
  Editor | null,
  React.PropsWithChildren<CollaborationEditorInnerProps>
>((props, ref) => {
  const { content, user, provider, pageInfo, toc, tocContained, width = 'w-[calc(100vw-350px)]', fullWidth, withTitle = true, onContentReady, extensions, extensionWrappers } = props
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
        MousePointerSync.configure({
          provider: provider,
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

  // Load content into the editor.
  //
  // With a collaboration provider, the content already lives in the Y.Doc by
  // the time we get here — either synced down from the server, or seeded by the
  // outer component *before* this editor was created. We must NOT call
  // `setContent` in that case: it would record fresh Yjs ops on top of the
  // existing state and duplicate every block (and, with the `title block*`
  // schema, leave a stray empty "Untitled" title above the real content).
  //
  // Without a provider, REST content is the single source of truth and is
  // loaded directly (progressively for very large documents so the main thread
  // stays responsive).
  React.useEffect(() => {
    if (!editor) return;

    if (provider) {
      // Y.Doc is the source of truth; the editor renders it on its own.
      setLoadProgress(100);
      setIsLargeDoc(false);
      setContentReady(true);
      onContentReady?.();
      return;
    }

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


  // Get current theme from context
  const { theme: currentTheme } = useTheme();
  const selectedTheme = currentTheme === 'dark' ? dark : light;
  const isMobile = useIsMobile();

  return (editor &&
    <PageContext.Provider value={pageInfo ?? {}}>
      <ThemeProvider theme={selectedTheme}>
        <div className={cn("flex flex-col relative", width, props.className)}>
          {!isMobile && <EditorMenu editor={editor} extensionWrappers={extensionWrappers as ExtensionWrapper[]} />}
          {/* Mobile: keep bubble/floating menus (toolbar={false}) and add a
              keyboard-docked formatting toolbar in place of the hidden top bar. */}
          {isMobile && (
            <EditorMenu editor={editor} extensionWrappers={extensionWrappers as ExtensionWrapper[]} toolbar={false} />
          )}
          <div className="flex-1 min-h-0 w-full overflow-y-auto" id="editor-container">
            {/* Cover/header spans the full pane width; rendered outside the
                centred StyledEditor column. */}
            {withTitle && contentReady && <PageHeader editor={editor} />}
            <StyledEditor $fullWidth={fullWidth}>
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
          {/* Bottom status bar: character / word / block counts */}
          {contentReady && <EditorStatusBar editor={editor} />}
          {/* Change-tracker merge bar (visible only while tracking is on) */}
          {contentReady && <ChangeTrackerBar editor={editor} />}
          {/* ToC - Notion-style floating outline on the right edge */}
          {toc && contentReady && (
            <NotionToC
              editor={editor}
              items={items}
              contained={tocContained}
              offsetTop={tocContained ? 40 : undefined}
            />
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

CollaborationEditorInner.displayName = "CollaborationEditorInner";


/**
 * Outer wrapper: resolves extensions and — crucially — seeds the collaborative
 * Y.Doc from REST content *before* the inner editor (and its Collaboration
 * extension) is created.
 *
 * Why this matters: the custom Doc schema requires `title block*`, so an editor
 * bound to an empty Y.Doc has to materialise an empty `title` node ("Untitled").
 * y-prosemirror can then write that placeholder into the Y.Doc; when the page's
 * real content (which carries its own title) is layered on top, the two titles
 * merge and the real title gets demoted into the body — the "extra Untitled on
 * top" bug. Seeding the Y.Doc first means the editor initialises from real
 * content and the placeholder is never created.
 */
type ExtensionBundle = {
  extensions: AnyExtension[];
  extensionWrappers: ExtensionWrapper[];
};

export const CollaborationEditor = forwardRef<
  Editor | null,
  React.PropsWithChildren<CollaborationEditorProps>
>((props, ref) => {
  const { content, provider, withTitle, externalExtensions } = props

  const [extensions, extensionWrappers] = useEditorExtension(undefined, withTitle, externalExtensions)
  const latestBundle = React.useMemo<ExtensionBundle>(() => ({
    extensions: extensions as AnyExtension[],
    extensionWrappers: extensionWrappers as ExtensionWrapper[],
  }), [extensions, extensionWrappers]);
  const [activeBundle, setActiveBundle] = React.useState<ExtensionBundle>(latestBundle);
  const latestBundleRef = React.useRef(latestBundle);
  latestBundleRef.current = latestBundle;
  const failedExtensionsRef = React.useRef<AnyExtension[] | null>(null);
  const innerEditorRef = React.useRef<Editor | null>(null);
  const [migrationPending, setMigrationPending] = React.useState(false);

  const setInnerEditorRef = React.useCallback((editor: Editor | null) => {
    innerEditorRef.current = editor;
    if (typeof ref === 'function') {
      ref(editor);
    } else if (ref) {
      ref.current = editor;
    }
  }, [ref]);

  // `readyFor` tracks which provider has been prepared. The inner editor is
  // only mounted once the *current* provider has been prepared, guaranteeing
  // the seed runs before the editor binds. `null` => no-provider case (ready
  // immediately, REST content is loaded by the inner editor itself).
  const NO_PROVIDER = React.useRef(Symbol("no-provider")).current;
  const [readyFor, setReadyFor] = useSafeState<TiptapCollabProvider | symbol | undefined>(undefined);

  // Always read the latest content/extensions at seed time without retriggering
  // the (provider-keyed) prepare effect when their identities churn.
  const contentRef = React.useRef(content);
  contentRef.current = content;
  const extensionsRef = React.useRef(extensions);
  extensionsRef.current = extensions;
  const pageIdRef = React.useRef(props.id);
  pageIdRef.current = props.id;
  const pageDocumentsRef = React.useRef(props.pageDocuments);
  pageDocumentsRef.current = props.pageDocuments;

  React.useEffect(() => {
    let cancelled = false;
    setReadyFor(undefined);
    failedExtensionsRef.current = null;

    if (!provider) {
      setReadyFor(NO_PROVIDER);
      return;
    }

    (async () => {
      // Reflect the server's state before deciding whether to seed.
      const didSync = await waitForProviderSync(provider);
      if (cancelled) return;

      // Only seed from REST content when sync actually completed. On timeout
      // the Y.Doc may simply not have received the server state yet — seeding
      // now would duplicate every block once sync finally lands (the merged
      // CRDT keeps both the seeded nodes and the server-synced nodes). Skip
      // seeding and mount the editor on whatever state the doc has; if sync
      // arrives later the Y.Doc populates naturally.
      if (didSync) {
        const restContent = contentRef.current;
        // Only seed when the collaborative doc has no content of its own yet.
        if (restContent && isYDocEmpty(provider.document)) {
          // Emptiness is necessary but not sufficient: every concurrent opener
          // sees the same emptiness. The server decides who actually seeds.
          const clientId = String(provider.document.clientID);
          const pageId = pageIdRef.current;
          const seedClaim = await claimSeedRight(pageDocumentsRef.current, pageId, clientId);
          if (cancelled) return;

          if (seedClaim.granted) {
            try {
              const exts = extensionsRef.current as AnyExtension[];
              const processed = rewriteUnknownContent(
                restContent as JSONContent,
                getSchema(exts),
                { fallbackToParagraph: true },
              ).json;
              // Re-check emptiness right before writing in case sync landed during
              // the awaits above.
              if (processed && isYDocEmpty(provider.document)) {
                const seededDoc = TiptapTransformer.toYdoc(processed, COLLAB_FIELD, exts);
                Y.applyUpdate(provider.document, Y.encodeStateAsUpdate(seededDoc));
              }
            } catch (e) {
              logger.error("[CollaborationEditor] failed to seed Y.Doc from REST content", e);
            } finally {
              // Hand the claim back rather than making the next opener wait out
              // the TTL. Safe either way: by now the doc is either seeded or
              // known to be non-empty.
              releaseSeedRight(seedClaim.documents, pageId, clientId);
            }
          }
          // Denied: another client is seeding this page right now. Its content
          // reaches us over the collaboration channel — writing our own copy is
          // exactly what produced duplicated blocks.
        }
      }

      // A route refresh can remount the whole editor before the in-place schema
      // transition effect gets a chance to run. Normalize an already-populated
      // Y.Doc here as well, before any Collaboration extension binds to it.
      const preparedBundle = latestBundleRef.current;
      try {
        migratePluginContentInYDoc(
          provider.document,
          getSchema(preparedBundle.extensions),
          COLLAB_FIELD,
        );
        if (!cancelled) setActiveBundle(preparedBundle);
      } catch (error) {
        failedExtensionsRef.current = preparedBundle.extensions;
        logger.error("[CollaborationEditor] failed to prepare plugin content", error);
        return;
      }

      if (!cancelled) setReadyFor(provider);
    })();

    return () => { cancelled = true; };
    // Keyed on provider only: seeding happens once per Y.Doc. Content/extension
    // identity changes are picked up via refs without remounting the editor.
  }, [provider]);

  // Provider ownership belongs to the outer editor. Schema transitions only
  // unmount the inner Tiptap instance and must not disconnect the room.
  React.useEffect(() => {
    if (!provider) return;

    return () => {
      provider.awareness?.destroy();
      provider.disconnect();
    };
  }, [provider]);

  const ready = provider ? readyFor === provider : readyFor === NO_PROVIDER;

  // Destroy the old schema binding before touching the Y.Doc. The next render
  // shows the preparation skeleton while the migration effect runs.
  React.useEffect(() => {
    if (
      !provider
      || !ready
      || migrationPending
      || activeBundle.extensions === extensions
      || failedExtensionsRef.current === extensions
    ) {
      return;
    }

    innerEditorRef.current?.destroy();
    setMigrationPending(true);
  }, [activeBundle.extensions, extensions, migrationPending, provider, ready]);

  React.useEffect(() => {
    if (!provider || !migrationPending) return;

    const nextBundle = latestBundleRef.current;
    try {
      migratePluginContentInYDoc(
        provider.document,
        getSchema(nextBundle.extensions),
        COLLAB_FIELD,
      );
      failedExtensionsRef.current = null;
      setActiveBundle(nextBundle);
    } catch (error) {
      failedExtensionsRef.current = nextBundle.extensions;
      logger.error("[CollaborationEditor] failed to migrate plugin content", error);
    } finally {
      setMigrationPending(false);
    }
  }, [migrationPending, provider]);

  const schemaChanged = provider
    && ready
    && activeBundle.extensions !== extensions
    && failedExtensionsRef.current !== extensions;
  const waitingForSchema = migrationPending || Boolean(schemaChanged && !innerEditorRef.current);

  if (!ready || waitingForSchema) {
    // Lightweight skeleton while we wait for sync / seed / schema migration.
    return (
      <div className={cn("flex flex-col relative", props.width ?? 'w-[calc(100vw-350px)]', props.className)}>
        <div className="flex-1 min-h-0 w-full overflow-y-auto p-4">
          <div className="space-y-3 animate-pulse">
            <div className="h-8 bg-muted rounded w-3/4" />
            <div className="h-4 bg-muted rounded w-full" />
            <div className="h-4 bg-muted rounded w-5/6" />
            <div className="h-4 bg-muted rounded w-full" />
            <div className="h-32 bg-muted rounded w-full" />
            <div className="h-4 bg-muted rounded w-4/5" />
          </div>
        </div>
      </div>
    );
  }

  const renderBundle = provider ? activeBundle : latestBundle;

  return (
    <CollaborationEditorInner
      key={provider ? `p:${props.id}` : `np:${props.id}`}
      ref={setInnerEditorRef}
      {...props}
      extensions={renderBundle.extensions}
      extensionWrappers={renderBundle.extensionWrappers}
    />
  );
});


CollaborationEditor.displayName = "CollaborationEditor";
