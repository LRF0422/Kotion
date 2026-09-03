import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Slider, cn } from '@kn/ui';
import { logger } from '@kn/common';
import {
    AudioLines,
    Download,
    Loader2,
    Maximize2,
    Minimize2,
    Pause,
    Play,
    RefreshCw,
    RotateCcw,
    Volume2,
    VolumeX,
} from '@kn/icon';
import { useI18n } from '../../../i18n/use-i18n';
import { formatMediaTime, type ResolvedMediaKind } from './media-utils';
import { useMediaController } from './useMediaController';

export interface MediaPlayerProps {
    kind: ResolvedMediaKind;
    src: string;
    label: string;
    sizeLabel?: string;
    onDownload: () => void;
}

const isShortcutTarget = (target: EventTarget | null): boolean =>
    target instanceof HTMLElement
    && !!target.closest('button, input, textarea, select, [role="slider"], [contenteditable="true"]');

const MediaErrorPanel: React.FC<{
    playbackError: boolean;
    onRetry: () => void;
    onDownload: () => void;
    dark?: boolean;
}> = ({ playbackError, onRetry, onDownload, dark = false }) => {
    const { t } = useI18n();
    return (
        <div className={cn('flex flex-col items-center justify-center gap-3 px-5 py-8 text-center', dark && 'text-white')} role="alert">
            <p className={cn('text-sm font-medium', !dark && 'text-foreground')}>
                {t(playbackError ? 'preview.playbackFailed' : 'preview.mediaLoadFailed')}
            </p>
            <p className={cn('max-w-sm text-xs', dark ? 'text-slate-300' : 'text-muted-foreground')}>
                {t('preview.downloadFallback')}
            </p>
            <div className="flex flex-wrap justify-center gap-2">
                <Button type="button" variant={dark ? 'secondary' : 'outline'} onClick={onRetry} className="h-11 lg:h-8">
                    <RefreshCw className="mr-2 h-4 w-4" />
                    {t('preview.retry')}
                </Button>
                <Button type="button" onClick={onDownload} className="h-11 lg:h-8">
                    <Download className="mr-2 h-4 w-4" />
                    {t('preview.download')}
                </Button>
            </div>
        </div>
    );
};

const AudioPreviewPlayer: React.FC<Omit<MediaPlayerProps, 'kind'>> = ({ src, label, sizeLabel, onDownload }) => {
    const { t } = useI18n();
    const controller = useMediaController<HTMLAudioElement>({ src, label });
    const effectiveVolume = controller.muted ? 0 : controller.volume;

    const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
        if (isShortcutTarget(event.target)) return;
        const key = event.key.toLowerCase();
        if (key === ' ' || key === 'k') {
            event.preventDefault();
            void controller.togglePlayback();
        } else if (key === 'arrowleft') {
            event.preventDefault();
            controller.skip(-5);
        } else if (key === 'arrowright') {
            event.preventDefault();
            controller.skip(5);
        } else if (key === 'arrowup') {
            event.preventDefault();
            controller.setVolume(effectiveVolume + 0.1);
        } else if (key === 'arrowdown') {
            event.preventDefault();
            controller.setVolume(effectiveVolume - 0.1);
        } else if (key === 'm') {
            event.preventDefault();
            controller.toggleMute();
        } else if (key === 'home') {
            event.preventDefault();
            controller.seek(0);
        } else if (key === 'end' && controller.duration > 0) {
            event.preventDefault();
            controller.seek(controller.duration);
        }
    };

    return (
        <div className="flex h-full w-full items-center justify-center p-4 md:p-8">
            <audio ref={controller.mediaRef} />
            <div
                tabIndex={0}
                onKeyDown={handleKeyDown}
                className="w-full max-w-2xl rounded-2xl border bg-card p-4 shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 md:p-6"
            >
                <div className="flex items-center gap-4">
                    <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary md:h-20 md:w-20">
                        <AudioLines className="h-8 w-8 md:h-10 md:w-10" aria-hidden="true" />
                    </div>
                    <div className="min-w-0 flex-1">
                        <p className="truncate text-base font-semibold" title={label}>{label}</p>
                        <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                            <span>{t('preview.audio')}</span>
                            {sizeLabel && <><span aria-hidden="true">•</span><span>{sizeLabel}</span></>}
                            {controller.buffering && (
                                <span className="inline-flex items-center gap-1" aria-live="polite">
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                    {t('preview.buffering')}
                                </span>
                            )}
                        </div>
                    </div>
                </div>

                {controller.error ? (
                    <MediaErrorPanel
                        playbackError={controller.error === 'playback'}
                        onRetry={controller.retry}
                        onDownload={onDownload}
                    />
                ) : (
                    <div className="mt-6 space-y-4">
                        <div className="flex items-center gap-3">
                            <span className="w-11 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                                {formatMediaTime(controller.currentTime)}
                            </span>
                            <Slider
                                min={0}
                                max={controller.duration || 1}
                                step={0.1}
                                value={[Math.min(controller.currentTime, controller.duration || 0)]}
                                disabled={!controller.duration}
                                aria-label={t('preview.seek')}
                                aria-valuetext={`${formatMediaTime(controller.currentTime)} / ${controller.duration ? formatMediaTime(controller.duration) : '--:--'}`}
                                onValueChange={([value]) => controller.seek(value)}
                                className="min-w-0 flex-1"
                            />
                            <span className="w-11 shrink-0 text-xs tabular-nums text-muted-foreground">
                                {controller.duration ? formatMediaTime(controller.duration) : '--:--'}
                            </span>
                        </div>

                        <div className="flex items-center justify-between gap-3">
                            <Button
                                type="button"
                                size="icon"
                                onClick={() => void controller.togglePlayback()}
                                aria-label={t(controller.ended ? 'preview.replay' : controller.playing ? 'preview.pause' : 'preview.play')}
                                className="h-14 w-14 shrink-0 rounded-full lg:h-11 lg:w-11"
                            >
                                {controller.ended
                                    ? <RotateCcw className="h-5 w-5" />
                                    : controller.playing
                                        ? <Pause className="h-5 w-5" />
                                        : <Play className="ml-0.5 h-5 w-5" />}
                            </Button>

                            <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
                                {controller.loading && (
                                    <span className="mr-auto inline-flex items-center gap-1.5 text-xs text-muted-foreground" aria-live="polite">
                                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                        {t('preview.loadingMedia')}
                                    </span>
                                )}
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    onClick={controller.toggleMute}
                                    aria-label={t(controller.muted || controller.volume === 0 ? 'preview.unmute' : 'preview.mute')}
                                    aria-pressed={controller.muted}
                                    className="h-11 w-11 shrink-0 rounded-full lg:h-8 lg:w-8"
                                >
                                    {controller.muted || controller.volume === 0
                                        ? <VolumeX className="h-4 w-4" />
                                        : <Volume2 className="h-4 w-4" />}
                                </Button>
                                <Slider
                                    min={0}
                                    max={1}
                                    step={0.05}
                                    value={[effectiveVolume]}
                                    onValueChange={([value]) => controller.setVolume(value)}
                                    aria-label={t('preview.volume')}
                                    aria-valuetext={`${Math.round(effectiveVolume * 100)}%`}
                                    className="hidden w-28 sm:flex"
                                />
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

type WebkitVideoElement = HTMLVideoElement & {
    webkitEnterFullscreen?: () => void;
    webkitDisplayingFullscreen?: boolean;
};

const VideoPreviewPlayer: React.FC<Omit<MediaPlayerProps, 'kind'>> = ({ src, label, onDownload }) => {
    const { t } = useI18n();
    const controller = useMediaController<HTMLVideoElement>({ src, label });
    const containerRef = useRef<HTMLDivElement>(null);
    const hideTimerRef = useRef<number | null>(null);
    const [controlsVisible, setControlsVisible] = useState(true);
    const [fullscreen, setFullscreen] = useState(false);
    const effectiveVolume = controller.muted ? 0 : controller.volume;

    const clearHideTimer = useCallback(() => {
        if (hideTimerRef.current !== null) {
            window.clearTimeout(hideTimerRef.current);
            hideTimerRef.current = null;
        }
    }, []);

    const revealControls = useCallback(() => {
        clearHideTimer();
        setControlsVisible(true);
        if (controller.playing && !controller.buffering && !controller.error) {
            hideTimerRef.current = window.setTimeout(() => setControlsVisible(false), 2800);
        }
    }, [clearHideTimer, controller.buffering, controller.error, controller.playing]);

    useEffect(() => {
        revealControls();
        return clearHideTimer;
    }, [clearHideTimer, revealControls]);

    useEffect(() => {
        const onFullscreenChange = () => setFullscreen(document.fullscreenElement === containerRef.current);
        const video = controller.mediaRef.current as WebkitVideoElement | null;
        const onWebkitBegin = () => setFullscreen(true);
        const onWebkitEnd = () => setFullscreen(false);
        document.addEventListener('fullscreenchange', onFullscreenChange);
        video?.addEventListener('webkitbeginfullscreen', onWebkitBegin);
        video?.addEventListener('webkitendfullscreen', onWebkitEnd);
        return () => {
            document.removeEventListener('fullscreenchange', onFullscreenChange);
            video?.removeEventListener('webkitbeginfullscreen', onWebkitBegin);
            video?.removeEventListener('webkitendfullscreen', onWebkitEnd);
        };
    }, [controller.mediaRef]);

    const toggleFullscreen = useCallback(async () => {
        const container = containerRef.current;
        const video = controller.mediaRef.current as WebkitVideoElement | null;
        if (!container || !video) return;
        try {
            if (document.fullscreenElement === container) {
                await document.exitFullscreen();
            } else if (container.requestFullscreen) {
                await container.requestFullscreen();
            } else if (video.webkitEnterFullscreen) {
                video.webkitEnterFullscreen();
            }
        } catch (error) {
            logger.error('Failed to toggle media preview fullscreen', { label, error });
        }
    }, [controller.mediaRef, label]);

    const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
        if (event.key === 'Escape' && fullscreen) {
            event.preventDefault();
            event.stopPropagation();
            void toggleFullscreen();
            return;
        }
        if (isShortcutTarget(event.target)) return;
        const key = event.key.toLowerCase();
        if (key === ' ' || key === 'k') {
            event.preventDefault();
            void controller.togglePlayback();
        } else if (key === 'arrowleft') {
            event.preventDefault();
            controller.skip(-5);
        } else if (key === 'arrowright') {
            event.preventDefault();
            controller.skip(5);
        } else if (key === 'arrowup') {
            event.preventDefault();
            controller.setVolume(effectiveVolume + 0.1);
        } else if (key === 'arrowdown') {
            event.preventDefault();
            controller.setVolume(effectiveVolume - 0.1);
        } else if (key === 'm') {
            event.preventDefault();
            controller.toggleMute();
        } else if (key === 'f') {
            event.preventDefault();
            void toggleFullscreen();
        } else if (key === 'home') {
            event.preventDefault();
            controller.seek(0);
        } else if (key === 'end' && controller.duration > 0) {
            event.preventDefault();
            controller.seek(controller.duration);
        }
        revealControls();
    };

    const handleVideoClick = () => {
        if (!controlsVisible) {
            revealControls();
            return;
        }
        void controller.togglePlayback();
    };

    return (
        <div className="flex h-full min-h-0 w-full items-center justify-center bg-[#090c12]">
            <div
                ref={containerRef}
                tabIndex={0}
                onKeyDown={handleKeyDown}
                onPointerMove={revealControls}
                onPointerDown={revealControls}
                onFocusCapture={revealControls}
                className={cn(
                    'group relative flex h-full max-h-full w-full items-center justify-center overflow-hidden bg-[#090c12] outline-none focus-visible:ring-2 focus-visible:ring-primary',
                    !controlsVisible && controller.playing && 'cursor-none',
                )}
            >
                <video
                    ref={controller.mediaRef}
                    playsInline
                    onClick={handleVideoClick}
                    className="h-full max-h-full w-full object-contain"
                    aria-label={label}
                />

                {controller.error ? (
                    <div className="absolute inset-0 flex items-center justify-center bg-[#090c12]/90">
                        <MediaErrorPanel
                            playbackError={controller.error === 'playback'}
                            onRetry={controller.retry}
                            onDownload={onDownload}
                            dark
                        />
                    </div>
                ) : (
                    <>
                        {(controller.loading || controller.buffering) && (
                            <div className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-live="polite">
                                <div className="flex items-center gap-2 rounded-full bg-black/55 px-4 py-2 text-sm text-white backdrop-blur-sm">
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    {t(controller.buffering ? 'preview.buffering' : 'preview.loadingMedia')}
                                </div>
                            </div>
                        )}

                        {!controller.playing && !controller.loading && (
                            <Button
                                type="button"
                                size="icon"
                                onClick={(event) => {
                                    event.stopPropagation();
                                    void controller.togglePlayback();
                                }}
                                aria-label={t(controller.ended ? 'preview.replay' : 'preview.play')}
                                className="absolute h-16 w-16 rounded-full bg-white/95 text-black shadow-xl hover:bg-white md:h-20 md:w-20"
                            >
                                {controller.ended
                                    ? <RotateCcw className="h-6 w-6 md:h-7 md:w-7" />
                                    : <Play className="ml-1 h-6 w-6 md:h-7 md:w-7" />}
                            </Button>
                        )}

                        <div
                            className={cn(
                                'absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/55 to-transparent px-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-12 text-white transition-opacity duration-200 motion-reduce:transition-none md:px-5 md:pb-4',
                                controlsVisible ? 'opacity-100' : 'pointer-events-none opacity-0',
                            )}
                        >
                            <Slider
                                min={0}
                                max={controller.duration || 1}
                                step={0.1}
                                value={[Math.min(controller.currentTime, controller.duration || 0)]}
                                disabled={!controller.duration}
                                aria-label={t('preview.seek')}
                                aria-valuetext={`${formatMediaTime(controller.currentTime)} / ${controller.duration ? formatMediaTime(controller.duration) : '--:--'}`}
                                onValueChange={([value]) => controller.seek(value)}
                                className="mb-2"
                            />
                            <div className="flex items-center gap-1.5">
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => void controller.togglePlayback()}
                                    aria-label={t(controller.ended ? 'preview.replay' : controller.playing ? 'preview.pause' : 'preview.play')}
                                    className="h-11 w-11 shrink-0 rounded-full text-white hover:bg-white/15 hover:text-white lg:h-8 lg:w-8"
                                >
                                    {controller.ended
                                        ? <RotateCcw className="h-4 w-4" />
                                        : controller.playing
                                            ? <Pause className="h-4 w-4" />
                                            : <Play className="ml-0.5 h-4 w-4" />}
                                </Button>
                                <span className="shrink-0 text-xs tabular-nums text-slate-200">
                                    {formatMediaTime(controller.currentTime)} / {controller.duration ? formatMediaTime(controller.duration) : '--:--'}
                                </span>
                                <div className="ml-auto flex items-center gap-1.5">
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        onClick={controller.toggleMute}
                                        aria-label={t(controller.muted || controller.volume === 0 ? 'preview.unmute' : 'preview.mute')}
                                        aria-pressed={controller.muted}
                                        className="h-11 w-11 shrink-0 rounded-full text-white hover:bg-white/15 hover:text-white lg:h-8 lg:w-8"
                                    >
                                        {controller.muted || controller.volume === 0
                                            ? <VolumeX className="h-4 w-4" />
                                            : <Volume2 className="h-4 w-4" />}
                                    </Button>
                                    <Slider
                                        min={0}
                                        max={1}
                                        step={0.05}
                                        value={[effectiveVolume]}
                                        onValueChange={([value]) => controller.setVolume(value)}
                                        aria-label={t('preview.volume')}
                                        aria-valuetext={`${Math.round(effectiveVolume * 100)}%`}
                                        className="hidden w-24 sm:flex"
                                    />
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => void toggleFullscreen()}
                                        aria-label={t(fullscreen ? 'preview.exitFullscreen' : 'preview.enterFullscreen')}
                                        className="h-11 w-11 shrink-0 rounded-full text-white hover:bg-white/15 hover:text-white lg:h-8 lg:w-8"
                                    >
                                        {fullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

export const MediaPlayer: React.FC<MediaPlayerProps> = ({ kind, ...props }) =>
    kind === 'audio' ? <AudioPreviewPlayer {...props} /> : <VideoPreviewPlayer {...props} />;
