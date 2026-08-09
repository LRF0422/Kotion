/**
 * TemplatePreview — read-only editor rendering of a template's page content.
 *
 * A template is just a page, so its content is fetched via GET_PAGE_CONTENT
 * and rendered with a real read-only Tiptap editor — matching actual page
 * rendering (headings, lists, code blocks, embeds…) instead of a plain-text
 * excerpt. Follows the same pattern as PagePreviewCard's PreviewBody.
 */
import React, { useEffect, useMemo, useState } from "react";
import {
    AnyExtension,
    Content,
    EditorContent,
    StyledEditor,
    useEditor,
    useEditorExtension,
} from "@kn/editor";
import { Skeleton } from "@kn/ui";
import { FileText } from "@kn/icon";
import { useApi, useTranslation } from "@kn/common";
import { APIS } from "../api";

/** Cover config persisted on the title node's attrs (see editor PageHeader). */
interface CoverConfig {
    url: string;
    position?: number;
}

/**
 * Parse the stored content JSON into a body-only doc plus the cover config.
 * The `title` node is stripped from the body: the preview header already
 * shows the title, and the read-only editor uses the plain Document top
 * node (no title schema) — but its attrs carry the page cover, so it's
 * read first.
 */
const parsePage = (raw?: string): { body: Content | null; cover: CoverConfig | null } => {
    if (!raw) return { body: null, cover: null };
    try {
        const doc = JSON.parse(raw.replaceAll("&lt;", "<").replaceAll("&gt;", ">"));
        const nodes: any[] = Array.isArray(doc?.content) ? doc.content : [];
        const title = nodes.find((n) => n?.type === "title");
        const cover = title?.attrs?.cover?.url ? (title.attrs.cover as CoverConfig) : null;
        const body = nodes.filter((n) => n?.type !== "title");
        return { body: body.length > 0 ? { type: "doc", content: body } : null, cover };
    } catch {
        return { body: null, cover: null };
    }
};

/** Read-only Tiptap instance rendering the page body at preview scale. */
const PreviewEditor: React.FC<{ content: Content }> = ({ content }) => {
    const [extensions] = useEditorExtension("trailingNode");
    const editor = useEditor(
        {
            editable: false,
            content,
            extensions: extensions as AnyExtension[],
            editorProps: {
                attributes: {
                    class: "magic-editor",
                    spellcheck: "false",
                },
            },
        },
        [content, extensions]
    );

    return (
        <StyledEditor
            className="pointer-events-none select-none"
            style={{ fontSize: "13px", padding: 0 }}
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

export interface TemplatePreviewProps {
    templateId: string;
    className?: string;
}

export const TemplatePreview: React.FC<TemplatePreviewProps> = ({ templateId, className }) => {
    const { t } = useTranslation();
    const [content, setContent] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError(false);
        useApi(APIS.GET_PAGE_CONTENT, { id: templateId })
            .then((res) => {
                if (cancelled) return;
                const data = res?.data;
                setContent(data?.content ?? null);
            })
            .catch(() => {
                if (!cancelled) setError(true);
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [templateId]);

    const { body } = useMemo(() => parsePage(content ?? undefined), [content]);

    return (
        <div className={className}>
            {loading ? (
                <PreviewSkeleton />
            ) : error ? (
                <p className="py-8 text-center text-xs text-muted-foreground">
                    {t("template.previewFailed", "Failed to load preview")}
                </p>
            ) : body ? (
                <PreviewEditor content={body} />
            ) : (
                <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                    <FileText className="h-8 w-8 mb-2 text-muted-foreground/30" />
                    <p className="text-xs">
                        {t("template.previewEmpty", "This template is empty")}
                    </p>
                </div>
            )}
        </div>
    );
};

TemplatePreview.displayName = "TemplatePreview";
