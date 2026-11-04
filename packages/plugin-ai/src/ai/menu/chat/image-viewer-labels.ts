import { useMemo } from 'react'
import { useTranslation } from '@kn/common'
import type { ImageLightboxLabels } from '@kn/ui'

export interface ImageViewerLabels {
    /** Trigger tooltip / accessible name for a zoomable thumbnail. */
    zoomLabel: string
    /** Strings for the full-screen viewer. */
    labels: ImageLightboxLabels
}

/**
 * Localized strings for {@link ImageLightbox} / {@link ZoomableImage}.
 *
 * @kn/ui must not depend on @kn/common, so the viewer takes its labels as props
 * (English defaults). Chat surfaces use this hook to feed the same keys the rest
 * of the AI panel uses.
 */
export function useImageViewerLabels(): ImageViewerLabels {
    const { t } = useTranslation()

    return useMemo<ImageViewerLabels>(() => ({
        zoomLabel: t('ai.chat.imageZoom', { defaultValue: '点击放大查看' }),
        labels: {
            dialog: t('ai.chat.imageViewer.dialog', { defaultValue: '图片预览' }),
            close: t('ai.chat.imageViewer.close', { defaultValue: '关闭预览' }),
            zoomIn: t('ai.chat.imageViewer.zoomIn', { defaultValue: '放大' }),
            zoomOut: t('ai.chat.imageViewer.zoomOut', { defaultValue: '缩小' }),
            reset: t('ai.chat.imageViewer.reset', { defaultValue: '还原大小' }),
            previous: t('ai.chat.imageViewer.previous', { defaultValue: '上一张' }),
            next: t('ai.chat.imageViewer.next', { defaultValue: '下一张' }),
            hint: t('ai.chat.imageViewer.hint', {
                defaultValue: '滚轮缩放 · 拖动平移 · 双击还原',
            }),
            loadError: t('ai.chat.imageViewer.loadError', { defaultValue: '图片加载失败' }),
            counter: (current: number, total: number) => t('ai.chat.imageViewer.counter', {
                current,
                total,
                defaultValue: '{{current}} / {{total}}',
            }),
        },
    }), [t])
}
