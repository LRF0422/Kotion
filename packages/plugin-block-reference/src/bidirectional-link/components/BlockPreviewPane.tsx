/**
 * BlockPreviewPane — inline read-only preview of a referenced block.
 *
 * Given a blockId it fetches the authoritative block node through
 * useBidirectionalBlockInfo (spacePageService.relations.getBlock) and renders it
 * with a real read-only Tiptap editor, so the preview matches the document
 * rendering instead of a plain-text excerpt.
 *
 * Used by BlockLinkPicker as the side panel next to the (( suggestion list.
 *
 * @module @kn/plugin-block-reference/bidirectional-link/components
 */

import React, { useMemo } from 'react';
import {
    AnyExtension,
    Content,
    EditorContent,
    StyledEditor,
    useEditor,
    useEditorExtension,
} from '@kn/editor';
import { Skeleton, cn } from '@kn/ui';
import { SquareDashedBottom } from '@kn/icon';
import { useBidirectionalBlockInfo } from '../hooks/useBidirectionalBlockInfo';
import { useI18n } from '../../i18n/use-i18n';
import { getBlockTypeLabel } from './block-types';

/**
 * Turn a stored block payload into a doc the plain Document schema can render.
 *
 * The block-detail endpoint wraps the whole node (not its children), and the
 * custom editor Doc only allows `title` as the first child, so a `title` block
 * is unwrapped to the heading it contains.
 */
const toDoc = (raw?: unknown): Content | null => {
    if (raw == null) return null;
    let parsed: any = raw;
    if (typeof raw === 'string') {
        try {
            parsed = JSON.parse(raw);
        } catch {
            return null;
        }
    }
    if (Array.isArray(parsed)) {
        return parsed.length > 0 ? ({ type: 'doc', content: parsed } as Content) : null;
    }
    if (typeof parsed !== 'object') return null;
    const node = parsed as Record<string, any>;
    if (node.type === 'doc') {
        const nodes = Array.isArray(node.content) ? node.content : [];
        return nodes.length > 0 ? ({ type: 'doc', content: nodes } as Content) : null;
    }
    if (node.type === 'title') {
        const children = Array.isArray(node.content) ? node.content : [];
        return children.length > 0 ? ({ type: 'doc', content: children } as Content) : null;
    }
    // Defensive: inline-only payloads must live inside a paragraph.
    if (node.type === 'text') {
        return { type: 'doc', content: [{ type: 'paragraph', content: [node] }] } as Content;
    }
    return { type: 'doc', content: [node] } as Content;
};

/** Read-only Tiptap instance rendering the block at preview scale. */
const PreviewEditor: React.FC<{ content: Content }> = ({ content }) => {
    const [extensions] = useEditorExtension('trailingNode');
    const editor = useEditor(
        {
            editable: false,
            content,
            extensions: extensions as AnyExtension[],
            editorProps: {
                attributes: {
                    class: 'magic-editor',
                    spellcheck: 'false',
                },
            },
        },
        [content, extensions]
    );

    return (
        // Shrink the whole prose scale and keep embedded node views from
        // swallowing clicks meant for the picker behind the pane.
        <StyledEditor
            className="pointer-events-none select-none"
            style={{ fontSize: '13px', padding: 0 }}
        >
            <EditorContent editor={editor} />
        </StyledEditor>
    );
};

const PreviewSkeleton: React.FC = () => (
    <div className="space-y-2 px-4 py-3">
        <Skeleton className="h-3.5 w-full" />
        <Skeleton className="h-3.5 w-5/6" />
        <Skeleton className="h-3.5 w-2/3" />
    </div>
);

export interface BlockPreviewPaneProps {
    blockId: string;
    className?: string;
}

export const BlockPreviewPane: React.FC<BlockPreviewPaneProps> = ({ blockId, className }) => {
    const { t } = useI18n();
    const { blockInfo, loading, error } = useBidirectionalBlockInfo(blockId, true);
    const doc = useMemo(() => toDoc(blockInfo?.content), [blockInfo?.content]);

    return (
        <div className={cn('flex flex-col overflow-hidden', className)}>
            {/* Header: source page + block type */}
            <div className="flex items-center gap-2 border-b border-border/60 px-3 py-2">
                <SquareDashedBottom className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate text-[13px] font-medium">
                    {blockInfo?.pageTitle || t('bidirectionalLink.untitled')}
                </span>
                <span className="flex-shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                    {getBlockTypeLabel(t, blockInfo?.type)}
                </span>
            </div>
            {/* Body: read-only editor clamped in height with a bottom fade */}
            <div className="relative min-h-0 flex-1 overflow-hidden px-4 py-3">
                {error ? (
                    <p className="py-4 text-center text-xs text-muted-foreground">
                        {t('bidirectionalLink.blockNotFound')}
                    </p>
                ) : loading || !blockInfo ? (
                    <PreviewSkeleton />
                ) : doc ? (
                    <div className="max-h-[320px] overflow-hidden">
                        <PreviewEditor content={doc} />
                    </div>
                ) : (
                    <p className="py-4 text-center text-xs text-muted-foreground">
                        {t('bidirectionalLink.noContent')}
                    </p>
                )}
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-popover to-transparent" />
            </div>
        </div>
    );
};

BlockPreviewPane.displayName = 'BlockPreviewPane';
