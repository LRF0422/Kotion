/**
 * SyncBlock View Component
 * Renders a synchronized block that shares content across multiple pages.
 * Uses Y.js collaboration for real-time synchronization.
 *
 * @module @kn/editor/extensions/sync-block
 */

import { ExtensionWrapper } from "@kn/common";
import { EditorMenu } from "../../editor/EditorMenu";
import { PageContext } from "../../editor/context";
import { useEditorExtension } from "../../editor/use-extension";
import { TiptapCollabProvider } from "@hocuspocus/provider";
import { AnyExtension, NodeViewProps } from "@tiptap/core";
import Collaboration from "@tiptap/extension-collaboration";
import Document from "@tiptap/extension-document";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import { EditorContent, NodeViewWrapper, useEditor } from "@tiptap/react";
import { useHover, useSafeState } from "ahooks";
import React, { useCallback, useContext, useEffect, useMemo, useRef } from "react";
import { Doc } from 'yjs';
import { StyledEditor } from "../../styles/editor";
import { cn, IconButton, Skeleton, Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@kn/ui";
import { RefreshCcw, Trash2, Link2, CheckCircle, AlertCircle, Loader2 } from "@kn/icon";

/** Minimal extensions required for a valid ProseMirror schema */
const minimalExtensions = [Document, Paragraph, Text] as AnyExtension[];

/** Sync status type */
type SyncStatus = 'connecting' | 'synced' | 'error' | 'disconnected';

/** Memoized toolbar button with tooltip */
const ToolbarButton = React.memo<{
    icon: React.ReactNode;
    onClick: () => void;
    label: string;
    disabled?: boolean;
}>(({ icon, onClick, label, disabled }) => (
    <TooltipProvider>
        <Tooltip>
            <TooltipTrigger asChild>
                <IconButton
                    icon={icon}
                    onClick={onClick}
                    aria-label={label}
                    disabled={disabled}
                />
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
                {label}
            </TooltipContent>
        </Tooltip>
    </TooltipProvider>
));
ToolbarButton.displayName = 'ToolbarButton';

/** Loading skeleton for sync block content */
const SyncBlockSkeleton = React.memo(() => (
    <div className="p-4 space-y-2" role="status" aria-label="Loading">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-1/2" />
    </div>
));
SyncBlockSkeleton.displayName = 'SyncBlockSkeleton';

/** Sync status indicator */
const SyncStatusIndicator = React.memo<{ status: SyncStatus }>(({ status }) => {
    const statusConfig = {
        connecting: {
            icon: <Loader2 className="h-3 w-3 animate-spin" />,
            label: 'Connecting...',
            className: 'text-muted-foreground',
        },
        synced: {
            icon: <CheckCircle className="h-3 w-3" />,
            label: 'Synced',
            className: 'text-green-500',
        },
        error: {
            icon: <AlertCircle className="h-3 w-3" />,
            label: 'Sync error',
            className: 'text-destructive',
        },
        disconnected: {
            icon: <AlertCircle className="h-3 w-3" />,
            label: 'Disconnected',
            className: 'text-yellow-500',
        },
    };

    const config = statusConfig[status];

    return (
        <TooltipProvider>
            <Tooltip>
                <TooltipTrigger asChild>
                    <div className={cn("flex items-center gap-1", config.className)}>
                        {config.icon}
                    </div>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">
                    {config.label}
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>
    );
});
SyncStatusIndicator.displayName = 'SyncStatusIndicator';

/**
 * SyncBlockView Component
 *
 * Displays a synchronized block with real-time collaboration support.
 * Features:
 * - Real-time Y.js collaboration
 * - Sync status indicator
 * - Hover-activated toolbar
 * - Loading and error states
 * - Proper cleanup on unmount
 */
export const SyncBlockView: React.FC<NodeViewProps> = React.memo((props) => {
    const { editor, node, deleteNode, updateAttributes } = props;
    // Exclude trailingNode to prevent automatic empty paragraph insertion
    const [extensions, extensionWrappers] = useEditorExtension('trailingNode');
    const [syncStatus, setSyncStatus] = useSafeState<SyncStatus>('connecting');
    const [error, setError] = useSafeState<string | null>(null);
    const [isReady, setIsReady] = useSafeState(false);
    const [provider, setProvider] = useSafeState<TiptapCollabProvider | null>(null);
    const [canSave, setCanSave] = useSafeState(false); // Prevent saving during init
    const pageInfo = useContext(PageContext);
    const ref = useRef<HTMLDivElement>(null);
    const hover = useHover(ref);
    const providerRef = useRef<TiptapCollabProvider | null>(null);
    const docRef = useRef<Doc | null>(null);
    const initializedRef = useRef(false);
    const contentSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    // Use blockId if available, otherwise fall back to id
    const blockId = (node.attrs.blockId || node.attrs.id) as string;
    // Get saved content from node attributes
    const savedContent = node.attrs.content as string | null;
    const savedContentRef = useRef(savedContent); // Keep ref to avoid stale closure

    // Early return if no valid blockId
    if (!blockId) {
        return (
            <NodeViewWrapper className="p-4 text-center text-destructive text-sm border border-destructive/50 rounded-md">
                Invalid sync block: missing block ID
            </NodeViewWrapper>
        );
    }

    /** Format the unique room key for collaboration - uses only blockId for cross-page sync */
    const formatRoomKey = useCallback(() => {
        const spaceId = pageInfo?.spaceId || 'default';
        // Only use spaceId + blockId so content syncs across pages
        return `sync:space:${spaceId}|block:${blockId}`;
    }, [pageInfo?.spaceId, blockId]);

    /** Get the collaboration base URL from the parent editor */
    const getBaseUrl = useCallback(() => {
        const collaborationExt = editor.extensionManager.extensions.find(
            e => e.name === 'collaboration'
        );
        return (collaborationExt as any)?.options?.provider?.configuration?.url ||
            (collaborationExt as any)?.provider?.configuration?.url ||
            process.env.COLLAB_URL ||
            'wss://kotion.top:8877/ws';
    }, [editor.extensionManager.extensions]);

    /** Create and manage the collaboration provider - only once per blockId */
    useEffect(() => {
        // Prevent re-initialization
        if (initializedRef.current) {
            return;
        }
        initializedRef.current = true;

        const roomKey = formatRoomKey();
        const doc = new Doc();
        docRef.current = doc;

        try {
            const newProvider = new TiptapCollabProvider({
                baseUrl: getBaseUrl(),
                name: roomKey,
                token: roomKey,
                document: doc,
                onSynced: ({ state }) => {
                    setSyncStatus('synced');
                    setError(null);
                    // Mark as ready only after first sync completes
                    // Check if this is a truly empty new document
                    const isNewDoc = state === false;
                    setIsReady(true);
                },
                onStatus: ({ status }) => {
                    if (status === 'connected') {
                        setSyncStatus('synced');
                    } else if (status === 'disconnected') {
                        setSyncStatus('disconnected');
                    }
                },
                onDisconnect: () => {
                    setSyncStatus('disconnected');
                },
            });

            providerRef.current = newProvider;
            setProvider(newProvider);
        } catch (err) {
            setSyncStatus('error');
            setError(err instanceof Error ? err.message : 'Failed to connect');
        }

        return () => {
            if (providerRef.current) {
                providerRef.current.disconnect();
                providerRef.current.destroy();
                providerRef.current = null;
            }
            if (docRef.current) {
                docRef.current.destroy();
                docRef.current = null;
            }
            initializedRef.current = false;
        };
    }, [blockId]); // Only re-run if blockId changes

    /** Create the inner editor with collaboration - only after provider is ready */
    const innerEditor = useEditor(
        // Only create full editor when provider is ready
        provider ? {
            editable: editor.isEditable,
            // Don't render immediately - wait for Y.js sync
            immediatelyRender: false,
            shouldRerenderOnTransaction: false,
            extensions: [
                // Filter out placeholder and trailingNode to prevent empty content insertion
                ...(extensions as AnyExtension[]).filter(ext =>
                    ext.name !== 'placeholder' && ext.name !== 'trailingNode'
                ),
                Collaboration.configure({
                    document: provider.document,
                    field: 'default',
                }),
            ] as AnyExtension[],
            editorProps: {
                attributes: {
                    class: "magic-editor",
                    spellcheck: "false",
                    suppressContentEditableWarning: "false",
                },
            },
            // Save content to node on update (debounced) - only after initialization
            onUpdate: ({ editor: innerEd }) => {
                // Skip saving during initialization phase
                if (!canSave) return;

                // Debounce content saving to avoid too many updates
                if (contentSaveTimeoutRef.current) {
                    clearTimeout(contentSaveTimeoutRef.current);
                }
                contentSaveTimeoutRef.current = setTimeout(() => {
                    const json = innerEd.getJSON();
                    const contentStr = JSON.stringify(json);
                    // Only update if content actually changed
                    if (contentStr !== savedContentRef.current) {
                        savedContentRef.current = contentStr;
                        updateAttributes({ content: contentStr });
                    }
                }, 500); // Save after 500ms of no changes
            },
        } : {
            // Minimal config when provider not ready - just enough for valid schema
            extensions: minimalExtensions,
            editable: false,
            immediatelyRender: false,
        },
        [editor.isEditable, provider, extensions, canSave, updateAttributes]
    );

    // Load saved content into editor when synced and editor is empty
    useEffect(() => {
        if (innerEditor && isReady && provider) {
            // Check if the Y.js doc is empty (only has default empty paragraph)
            const currentContent = innerEditor.getJSON();
            const isEmpty = !currentContent.content ||
                currentContent.content.length === 0 ||
                (currentContent.content.length === 1 &&
                    currentContent.content[0].type === 'paragraph' &&
                    (!currentContent.content[0].content || currentContent.content[0].content.length === 0));

            if (isEmpty && savedContentRef.current) {
                try {
                    const parsed = JSON.parse(savedContentRef.current);
                    // Only set content if it's not empty
                    if (parsed.content && parsed.content.length > 0) {
                        innerEditor.commands.setContent(parsed);
                    }
                } catch (e) {
                    console.error('Failed to parse saved content:', e);
                }
            }

            // Enable saving after initial load is complete (with small delay)
            setTimeout(() => {
                setCanSave(true);
            }, 100);
        }
    }, [innerEditor, isReady, provider, setCanSave]);

    // Cleanup timeout on unmount
    useEffect(() => {
        return () => {
            if (contentSaveTimeoutRef.current) {
                clearTimeout(contentSaveTimeoutRef.current);
            }
        };
    }, []);

    // Only render editor content when provider is ready
    const showEditor = provider !== null && innerEditor !== null;

    /** Handle manual reconnect */
    const handleReconnect = useCallback(() => {
        if (providerRef.current) {
            setSyncStatus('connecting');
            providerRef.current.connect();
        }
    }, [setSyncStatus]);

    /** Handle copy sync block link */
    const handleCopyLink = useCallback(() => {
        const link = `sync-block:${blockId}`;
        navigator.clipboard.writeText(link);
    }, [blockId]);

    /** Memoized refresh icon */
    const refreshIcon = useMemo(() => (
        <RefreshCcw className={cn("w-4 h-4", syncStatus === 'connecting' && 'animate-spin')} />
    ), [syncStatus]);

    // Show loading until first sync is complete
    const isLoading = !isReady && syncStatus === 'connecting';

    return (
        <NodeViewWrapper
            as="div"
            ref={ref}
            className={cn(
                "border rounded-md relative group my-2 transition-colors",
                syncStatus === 'synced' && "border-border",
                syncStatus === 'connecting' && "border-muted-foreground/50",
                syncStatus === 'error' && "border-destructive/50",
                syncStatus === 'disconnected' && "border-yellow-500/50"
            )}
            role="region"
            aria-label="Sync Block"
            aria-busy={isLoading}
            data-sync-status={syncStatus}
        >
            {/* Header bar */}
            <div className="flex items-center justify-between px-2 py-1 border-b bg-muted/30 rounded-t-md">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Link2 className="h-3 w-3" />
                    <span>Sync Block</span>
                    <SyncStatusIndicator status={syncStatus} />
                </div>

                {/* Toolbar */}
                <div
                    className={cn(
                        "flex items-center gap-0.5",
                        "transition-opacity duration-200",
                        hover ? 'opacity-100' : 'opacity-0 pointer-events-none'
                    )}
                    role="toolbar"
                    aria-label="Sync block actions"
                >
                    <ToolbarButton
                        icon={refreshIcon}
                        onClick={handleReconnect}
                        label={syncStatus === 'disconnected' ? 'Reconnect' : 'Refresh'}
                        disabled={syncStatus === 'connecting'}
                    />
                    <ToolbarButton
                        icon={<Link2 className="w-4 h-4" />}
                        onClick={handleCopyLink}
                        label="Copy link"
                    />
                    {editor.isEditable && (
                        <ToolbarButton
                            icon={<Trash2 className="w-4 h-4" />}
                            onClick={deleteNode}
                            label="Delete"
                        />
                    )}
                </div>
            </div>

            {/* Content area */}
            <div className="min-h-[40px]">
                {isLoading && <SyncBlockSkeleton />}

                {error && (
                    <div className="p-4 text-center text-destructive text-sm" role="alert">
                        <span className="font-medium">Sync Error:</span> {error}
                    </div>
                )}

                {!isLoading && !error && showEditor && (
                    <>
                        <StyledEditor className="min-h-[40px]">
                            <EditorContent editor={innerEditor} />
                        </StyledEditor>
                        <EditorMenu
                            editor={innerEditor}
                            extensionWrappers={extensionWrappers as ExtensionWrapper[]}
                            toolbar={false}
                        />
                    </>
                )}

                {!isLoading && !error && !showEditor && (
                    <div className="p-4 text-center text-muted-foreground text-sm italic">
                        Initializing editor...
                    </div>
                )}
            </div>
        </NodeViewWrapper>
    );
});

SyncBlockView.displayName = 'SyncBlockView';
