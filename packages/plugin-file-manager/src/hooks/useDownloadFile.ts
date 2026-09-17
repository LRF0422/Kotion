import { useCallback } from 'react';
import { useFileService } from '@kn/common';
import { toast } from '@kn/ui';
import { useI18n } from '../i18n/use-i18n';

/** File to download; mirrors `FileItem` without the UI-only fields. */
export interface DownloadRequest {
    id?: string;
    name?: string;
    path?: string;
    size?: number;
}

/**
 * Download a file with visible feedback.
 *
 * The browser only shows a save dialog while the click's user activation is
 * still alive, so the service asks for the destination first and then streams
 * into it; this hook mirrors that progress into a toast so the user can tell a
 * slow transfer apart from a silent failure.
 */
export const useDownloadFile = () => {
    const fileService = useFileService();
    const { t } = useI18n();

    return useCallback(
        async (file: DownloadRequest): Promise<void> => {
            const name = file.name ?? '';
            const toastId = toast.loading(t('download.preparing', { name }));
            try {
                const outcome = await fileService.download(file.path ?? '', {
                    fileId: file.id,
                    fileName: file.name,
                    size: file.size,
                    onProgress: ({ loaded, total }) => {
                        if (!total || total <= 0) return;
                        const percent = Math.min(100, Math.floor((loaded / total) * 100));
                        toast.loading(t('download.progress', { name, percent }), { id: toastId });
                    },
                });

                if (outcome === 'cancelled') {
                    toast.dismiss(toastId);
                    return;
                }
                if (outcome === 'handed-off') {
                    toast.info(t('download.started', { name }), { id: toastId });
                    return;
                }
                toast.success(t('download.saved', { name }), { id: toastId });
            } catch (error) {
                // Server/user-facing detail (e.g. "文件不存在") beats a generic line.
                const detail = error instanceof Error ? error.message : '';
                toast.error(t('download.failed'), {
                    id: toastId,
                    ...(detail && detail !== t('download.failed') ? { description: detail } : {}),
                });
            }
        },
        [fileService, t],
    );
};
