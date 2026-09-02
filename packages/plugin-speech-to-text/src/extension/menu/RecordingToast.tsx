import React, { useEffect } from 'react';
import { toast, cn, Button } from '@kn/ui';
import { useTranslation } from '@kn/common';
import { Mic, Pause, Play, Square } from '@kn/icon';
import { Editor } from '@kn/editor';
import { speechController, useSpeechController } from '../../speech-controller';
import { RecordingWaveform } from '../components/RecordingWaveform';

/** Id of the currently open recording toast, so we never open two at once. */
let activeToastId: string | number | null = null;

const LANGS: { value: string; label: string }[] = [
    { value: 'zh-CN', label: '中' },
    { value: 'en-US', label: 'EN' },
];

function formatDuration(totalSeconds: number): string {
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

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
        <div className="w-[min(340px,calc(100vw-2rem))] select-none overflow-hidden rounded-xl border border-border/90 bg-popover/95 text-popover-foreground shadow-2xl ring-1 ring-black/15 backdrop-blur-xl">
            <div className="p-3.5">
                {/* Header */}
                <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2.5">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                            <Mic className="h-4 w-4" />
                        </span>
                        <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-foreground">{t('speechToText.title')}</p>
                            <p className="text-[11px] text-muted-foreground">
                                {isRecording ? t('speechToText.listening') : t('speechToText.paused')}
                            </p>
                        </div>
                    </div>

                    {/* Language segmented control */}
                    <div className="flex shrink-0 items-center rounded-lg border border-border/70 bg-muted/40 p-0.5 text-xs">
                        {LANGS.map((l) => (
                            <button
                                key={l.value}
                                type="button"
                                onClick={() => setLang(l.value)}
                                className={cn(
                                    'h-8 min-w-8 rounded-md px-2 font-medium transition-colors',
                                    lang === l.value
                                        ? 'bg-background text-foreground shadow-sm'
                                        : 'text-muted-foreground hover:text-foreground'
                                )}
                            >
                                {l.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Status + waveform + timer */}
                <div className="mt-3 rounded-lg border border-border/60 bg-muted/35 px-3 py-2.5">
                    <div className="flex items-center gap-3">
                        <span className="flex shrink-0 items-center gap-1.5">
                            <span
                                className={cn(
                                    'h-2 w-2 rounded-full ring-4',
                                    isRecording
                                        ? 'animate-pulse bg-destructive ring-destructive/10'
                                        : 'bg-amber-500 ring-amber-500/10'
                                )}
                            />
                            <span className="whitespace-nowrap text-xs font-medium text-foreground/80">
                                {isRecording ? t('speechToText.listening') : t('speechToText.paused')}
                            </span>
                        </span>

                        <RecordingWaveform active={isRecording} className="min-w-0" />

                        <span className="whitespace-nowrap font-mono text-xs font-medium tabular-nums text-foreground/70">
                            {formatDuration(duration)}
                        </span>
                    </div>

                    {/* Live interim transcript */}
                    <p aria-live="polite" className="mt-2 line-clamp-2 min-h-[18px] border-t border-border/50 pt-2 text-xs leading-relaxed text-muted-foreground">
                        {interim || (isRecording ? t('speechToText.listening') : '')}
                    </p>
                </div>
            </div>

            {/* Controls */}
            <div className="flex items-center gap-1.5 border-t border-border/70 bg-muted/20 p-2">
                <Button
                    variant="secondary"
                    size="sm"
                    className="h-10 flex-1 gap-1.5 bg-background/80 text-foreground shadow-sm hover:bg-background"
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
                    className="h-10 flex-1 gap-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
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
