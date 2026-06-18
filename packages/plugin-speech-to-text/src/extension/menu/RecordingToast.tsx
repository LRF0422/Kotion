import React, { useEffect, useRef } from 'react';
import { toast, cn, Button } from '@kn/ui';
import { useTranslation } from '@kn/common';
import { Mic, Pause, Play, Square } from '@kn/icon';
import { Editor } from '@kn/editor';
import { speechController, useSpeechController } from '../../speech-controller';

/** Id of the currently open recording toast, so we never open two at once. */
let activeToastId: string | number | null = null;

const LANGS: { value: string; label: string }[] = [
    { value: 'zh-CN', label: '中' },
    { value: 'en-US', label: 'EN' },
];

const BAR_COUNT = 18;

function formatDuration(totalSeconds: number): string {
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/**
 * Live equalizer. Heights are driven via rAF directly on the DOM (not React
 * state) so it stays smooth and never re-renders the toast. Monochrome to match
 * the app's restrained palette.
 */
const Waveform: React.FC<{ active: boolean }> = ({ active }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const rafRef = useRef<number | null>(null);

    useEffect(() => {
        const stop = () => {
            if (rafRef.current) {
                cancelAnimationFrame(rafRef.current);
                rafRef.current = null;
            }
        };
        const bars = containerRef.current?.querySelectorAll<HTMLDivElement>('.wave-bar');
        if (!active || !bars) {
            bars?.forEach((b) => (b.style.transform = 'scaleY(0.12)'));
            return stop;
        }
        const tick = () => {
            bars.forEach((bar, i) => {
                // Bell-ish envelope so the centre bars are taller.
                const center = 1 - Math.abs(i - (BAR_COUNT - 1) / 2) / (BAR_COUNT / 2);
                const h = 0.15 + Math.random() * (0.35 + center * 0.5);
                bar.style.transform = `scaleY(${h.toFixed(3)})`;
            });
            rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
        return stop;
    }, [active]);

    return (
        <div ref={containerRef} className="flex h-5 flex-1 items-center justify-center gap-[3px]">
            {Array.from({ length: BAR_COUNT }).map((_, i) => (
                <div
                    key={i}
                    className={cn(
                        'wave-bar h-full w-[2px] origin-center transition-[transform] duration-100 ease-out',
                        active ? 'bg-muted-foreground' : 'bg-muted-foreground/30'
                    )}
                    style={{ transform: 'scaleY(0.12)' }}
                />
            ))}
        </div>
    );
};

const RecordingToast: React.FC<{ toastId: string | number }> = ({ toastId }) => {
    const { t } = useTranslation();
    const { status, duration, interim, lang, pause, resume, stop, setLang } = useSpeechController();

    // Dismiss the toast once recording fully stops.
    useEffect(() => {
        if (status === 'idle') {
            toast.dismiss(toastId);
            if (activeToastId === toastId) activeToastId = null;
        }
    }, [status, toastId]);

    const isRecording = status === 'recording';

    return (
        <div className="w-[320px] select-none p-3">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-foreground">
                    <Mic className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">{t('speechToText.title')}</span>
                </div>

                {/* Language segmented control */}
                <div className="flex items-center gap-1 text-xs">
                    {LANGS.map((l) => (
                        <button
                            key={l.value}
                            onClick={() => setLang(l.value)}
                            className={cn(
                                'h-6 min-w-[26px] rounded-md px-1.5 font-medium transition-colors',
                                lang === l.value
                                    ? 'bg-muted text-foreground'
                                    : 'text-muted-foreground hover:text-foreground'
                            )}
                        >
                            {l.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Status + waveform + timer */}
            <div className="mt-3 flex items-center gap-3">
                <span className="flex items-center gap-1.5">
                    <span
                        className={cn(
                            'h-1.5 w-1.5 rounded-full',
                            isRecording ? 'bg-destructive animate-pulse' : 'bg-muted-foreground/40'
                        )}
                    />
                    <span className="whitespace-nowrap text-xs text-muted-foreground">
                        {isRecording ? t('speechToText.listening') : t('speechToText.paused')}
                    </span>
                </span>

                <Waveform active={isRecording} />

                <span className="whitespace-nowrap font-mono text-xs tabular-nums text-muted-foreground">
                    {formatDuration(duration)}
                </span>
            </div>

            {/* Live interim transcript */}
            <p className="mt-2 line-clamp-2 min-h-[18px] text-xs leading-relaxed text-muted-foreground">
                {interim || (isRecording ? t('speechToText.listening') : '')}
            </p>

            {/* Controls */}
            <div className="mt-2 flex items-center gap-1 border-t border-border pt-2">
                <Button
                    variant="ghost"
                    size="sm"
                    className="flex-1 gap-1.5 text-muted-foreground hover:text-foreground"
                    onClick={isRecording ? pause : resume}
                >
                    {isRecording ? (
                        <>
                            <Pause className="h-3.5 w-3.5" />
                            {t('speechToText.pause')}
                        </>
                    ) : (
                        <>
                            <Play className="h-3.5 w-3.5" />
                            {t('speechToText.resume')}
                        </>
                    )}
                </Button>
                <Button
                    variant="ghost"
                    size="sm"
                    className="flex-1 gap-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    onClick={stop}
                >
                    <Square className="h-3.5 w-3.5" />
                    {t('speechToText.stop')}
                </Button>
            </div>
        </div>
    );
};

/**
 * Start dictation and show the non-modal recording toast. Because a toast does
 * not capture pointer events on the rest of the page, the user can click into
 * the editor to reposition the caret, then resume to continue at the new spot.
 */
export function startSpeech(editor: Editor, lang?: string): void {
    if (!speechController.isSupported) {
        toast.error('此浏览器不支持语音识别，请使用 Chrome 或 Edge。');
        return;
    }
    speechController.start(editor, lang);
    if (activeToastId == null) {
        activeToastId = toast.custom((id) => <RecordingToast toastId={id} />, {
            duration: Infinity,
            dismissible: false,
        });
    }
}
