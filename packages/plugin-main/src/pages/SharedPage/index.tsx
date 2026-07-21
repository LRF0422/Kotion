import { APIS } from "../../api";
import { Button } from "@kn/ui";
import { EditorRender } from "@kn/editor";
import { useApi, useNavigator, useSafeState, useTranslation, GlobalState } from "@kn/common";
import { AlertCircle, Clock, ExternalLink, Eye, Loader2 } from "@kn/icon";
import React, { useEffect, useState } from "react";
import { useParams, useSelector } from "@kn/common";
import type { SharedPage as SharedPageModel } from "../../model/Space";

type LoadStatus = 'loading' | 'ready' | 'error';

/**
 * Public read-only view of a shared page, reached via /share/:shortCode.
 * Resolves the short code through the unauthenticated resolve endpoint and
 * renders the page content with a non-editable editor instance.
 */
export const SharedPage: React.FC = () => {
    const { t } = useTranslation();
    const params = useParams();
    const navigator = useNavigator();
    const { userInfo } = useSelector((state: GlobalState) => state);

    const [status, setStatus] = useState<LoadStatus>('loading');
    const [page, setPage] = useSafeState<SharedPageModel | null>(null);
    const [errorMessage, setErrorMessage] = useState<string>('');

    useEffect(() => {
        const shortCode = params.shortCode;
        if (!shortCode) {
            setStatus('error');
            setErrorMessage(t('sharedPage.invalid-link'));
            return;
        }
        setStatus('loading');
        useApi(APIS.RESOLVE_SHARE_LINK, { shortCode })
            .then(res => {
                setPage(res.data);
                setStatus('ready');
            })
            .catch((error: any) => {
                console.error('Failed to resolve share link:', error);
                setErrorMessage(error?.message || t('sharedPage.resolve-error'));
                setStatus('error');
            });
    }, [params.shortCode]);

    // Pre-parse page content for the read-only editor
    const parsedContent = React.useMemo(() => {
        if (!page?.content) return undefined;
        try {
            return JSON.parse((page.content as string).replaceAll("&lt;", "<").replaceAll("&gt;", ">"));
        } catch {
            return undefined;
        }
    }, [page?.content]);

    const canEnterEdit = !!userInfo?.id && page?.permission === 'WRITE';

    if (status === 'loading') {
        return (
            <div className="flex h-dvh items-center justify-center">
                <div className="flex flex-col items-center gap-3 text-muted-foreground">
                    <Loader2 className="h-8 w-8 animate-spin" />
                    <span className="text-sm">{t('sharedPage.loading')}</span>
                </div>
            </div>
        );
    }

    if (status === 'error') {
        return (
            <div className="flex h-dvh items-center justify-center p-4">
                <div className="flex max-w-md flex-col items-center gap-4 rounded-lg border p-8 text-center">
                    <AlertCircle className="h-10 w-10 text-destructive" />
                    <div className="text-lg font-semibold">{t('sharedPage.unavailable')}</div>
                    <div className="text-sm text-muted-foreground">{errorMessage}</div>
                    <Button variant="outline" onClick={() => navigator.go({ to: '/' })}>
                        {t('sharedPage.back-home')}
                    </Button>
                </div>
            </div>
        );
    }

    return (
        <div className="flex h-dvh flex-col">
            {/* Shared-page banner */}
            <div className="flex items-center justify-between border-b px-4 py-2">
                <div className="flex items-center gap-2 min-w-0">
                    <Eye className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="truncate text-sm font-medium">{page?.title || t('sharedPage.untitled')}</span>
                    <span className="hidden sm:inline rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                        {t('sharedPage.read-only')}
                    </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    {page?.expiresAt && (
                        <span className="hidden md:flex items-center gap-1 text-xs text-muted-foreground">
                            <Clock className="h-3 w-3" />
                            {t('sharedPage.expires-at', { time: new Date(page.expiresAt).toLocaleDateString() })}
                        </span>
                    )}
                    {canEnterEdit && (
                        <Button
                            size="sm"
                            className="h-7 gap-1 text-xs"
                            onClick={() => navigator.go({ to: `/space-detail/${page!.spaceId}/page/edit/${page!.pageId}` })}
                        >
                            <ExternalLink className="h-3.5 w-3.5" />
                            {t('sharedPage.enter-edit')}
                        </Button>
                    )}
                </div>
            </div>

            {/* Read-only content */}
            <div className="flex-1 min-h-0 overflow-hidden">
                <EditorRender
                    id={String(page?.pageId)}
                    content={parsedContent}
                    isEditable={false}
                    toc={true}
                    withTitle={true}
                    width="w-full"
                    className="h-full"
                />
            </div>
        </div>
    );
};

export default SharedPage;
