/**
 * PagePreviewPane — inline editor-rendered preview of a page.
 *
 * Embedded (non-popup) variant of the page preview: given a pageId it fetches
 * the page through usePageInfo (LRU-cached via spacePageService.pages) and
 * renders cover + header + body. The body uses a real read-only Tiptap editor
 * so the preview matches actual page rendering (headings, lists, code blocks,
 * embeds…) instead of a plain-text excerpt.
 *
 * Used by PageLinkPicker as the side panel next to the [[ suggestion list.
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
import { FlatEmoji, Skeleton, cn } from '@kn/ui';
import { FileText } from '@kn/icon';
import { FileService, useOptionalService } from '@kn/common';
import { usePageInfo } from '../../hooks';
import { useI18n } from '../../i18n/use-i18n';
import { getIconText } from '../../utils';

/** Cover config persisted on the title node's attrs (see editor PageHeader). */
interface CoverConfig {
    url: string;
    /** 0-100 vertical position percentage, default 50 */
    position?: number;
}

/**
 * Parse the stored content JSON into a body-only doc plus the cover config.
 * The `title` node is stripped from the body (the pane header already shows
 * the title, and the read-only editor uses the plain Document top node), but
 * its attrs carry the page cover, so it's read before filtering.
 */
const parsePage = (raw?: unknown): { body: Content | null; cover: CoverConfig | null } => {
    if (!raw) return { body: null, cover: null };
    try {
        const doc = typeof raw === 'string'
            ? JSON.parse(raw.replaceAll('&lt;', '<').replaceAll('&gt;', '>'))
            : raw;
        const nodes: any[] = Array.isArray(doc?.content) ? doc.content : [];
        const title = nodes.find((n) => n?.type === 'title');
        const cover = title?.attrs?.cover?.url ? (title.attrs.cover as CoverConfig) : null;
        const body = nodes.filter((n) => n?.type !== 'title');
        return { body: body.length > 0 ? { type: 'doc', content: body } : null, cover };
    } catch {
        return { body: null, cover: null };
    }
};

/** Read-only Tiptap instance rendering the page body at preview scale. */
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
        // Inline font-size shrinks the whole prose scale (children size in em);
        // pointer-events-none keeps embedded node views from swallowing clicks.
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
        <Skeleton className="h-3.5 w-full" />
        <Skeleton className="h-3.5 w-2/3" />
    </div>
);

export interface PagePreviewPaneProps {
    pageId: string;
    className?: string;
}

export const PagePreviewPane: React.FC<PagePreviewPaneProps> = ({ pageId, className }) => {
    const { t } = useI18n();
    const fileService = useOptionalService('fileService') as FileService | undefined;
    const { pageInfo, loading, error } = usePageInfo(pageId);

    const { body, cover } = useMemo(
        () => parsePage(pageInfo?.legacyContent),
        [pageInfo?.legacyContent]
    );
    const icon = getIconText(pageInfo?.icon);

    // Same URL resolution chain as the editor's PageHeader: absolute/data URLs
    // pass through, stored file names go through fileService's download endpoint.
    const coverUrl = useMemo(() => {
        const url = cover?.url;
        if (!url) return null;
        if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:')) {
            return url;
        }
        if (fileService) return fileService.getDownloadUrl(url);
        return `https://kotion.top:888/api/knowledge-resource/oss/endpoint/download?fileName=${url}`;
    }, [cover?.url, fileService]);

    return (
        <div className={cn('flex flex-col overflow-hidden', className)}>
            {/* Cover banner — mirrors the page's own cover crop position */}
            {coverUrl && (
                <div className="h-[84px] w-full shrink-0 overflow-hidden bg-muted/30">
                    <img
                        src={coverUrl}
                        alt=""
                        className="h-full w-full object-cover"
                        style={{ objectPosition: `center ${cover?.position ?? 50}%` }}
                        draggable={false}
                    />
                </div>
            )}
            {/* Header: icon + title + space name */}
            <div className="flex items-center gap-2 border-b border-border/60 px-3 py-2">
                {icon ? (
                    <FlatEmoji emoji={icon} size={16} className="flex-shrink-0" />
                ) : (
                    <FileText className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                )}
                <span className="min-w-0 flex-1 truncate text-[13px] font-medium">
                    {pageInfo?.title || t('bidirectionalLink.untitled')}
                </span>
            </div>
            {/* Body: read-only editor clamped in height with a bottom fade */}
            <div className="relative min-h-0 flex-1 overflow-hidden px-4 py-3">
                {error ? (
                    <p className="py-4 text-center text-xs text-muted-foreground">
                        {t('bidirectionalLink.loadFailed')}
                    </p>
                ) : loading || !pageInfo ? (
                    <PreviewSkeleton />
                ) : body ? (
                    <PreviewEditor content={body} />
                ) : (
                    <p className="py-4 text-center text-xs text-muted-foreground">
                        {t('bidirectionalLink.previewEmpty')}
                    </p>
                )}
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-popover to-transparent" />
            </div>
        </div>
    );
};

PagePreviewPane.displayName = 'PagePreviewPane';
