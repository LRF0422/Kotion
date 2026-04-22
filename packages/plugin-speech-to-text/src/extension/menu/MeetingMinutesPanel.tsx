import { Mic, MicOff, Pause, Play, Square, X, FileAudio, Sparkles, CheckCircle2, Loader2, Lightbulb, Settings, Volume2, Copy, Pencil, ChevronDown, Calendar } from "@kn/icon";
import { Button } from "@kn/ui";
import { cn } from "@kn/ui";
import React, { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { useMeetingRecorder } from "../../hooks/useMeetingRecorder";
import { Editor } from "@kn/editor";
import { useEditorAgentOptimized } from "@kn/common";
import { toast } from "@kn/ui";
import { useFileService } from "@kn/common";
import { useTranslation } from "@kn/common";

const MEETING_MINUTES_PANEL_EVENT = 'meeting-minutes-panel-open';

export const dispatchMeetingMinutesPanelOpen = () => {
    document.dispatchEvent(new CustomEvent(MEETING_MINUTES_PANEL_EVENT));
};

const formatDuration = (seconds: number): string => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hrs > 0) {
        return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

const WaveformIndicator: React.FC<{ isActive: boolean }> = ({ isActive }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const animationRef = useRef<number | null>(null);

    useEffect(() => {
        if (!isActive || !containerRef.current) {
            if (animationRef.current) {
                cancelAnimationFrame(animationRef.current);
                animationRef.current = null;
            }
            return;
        }

        const bars = containerRef.current.querySelectorAll<HTMLDivElement>('.wave-bar');

        const animate = () => {
            bars.forEach((bar) => {
                const height = Math.random() * 24 + 8;
                bar.style.height = `${height}px`;
            });
            animationRef.current = requestAnimationFrame(animate);
        };

        animationRef.current = requestAnimationFrame(animate);
        return () => {
            if (animationRef.current) {
                cancelAnimationFrame(animationRef.current);
            }
        };
    }, [isActive]);

    return (
        <div ref={containerRef} className="flex items-center justify-center gap-1 h-10">
            {Array.from({ length: 12 }).map((_, i) => (
                <div
                    key={i}
                    className={cn(
                        "wave-bar w-1.5 rounded-full transition-all duration-150",
                        isActive
                            ? "bg-gradient-to-t from-indigo-500 to-purple-500"
                            : "bg-muted-foreground/30"
                    )}
                    style={{ height: '8px' }}
                />
            ))}
        </div>
    );
};

interface AudioPlayerProps {
    audioUrl: string;
    onEnded?: () => void;
}

const AudioPlayer: React.FC<AudioPlayerProps> = ({ audioUrl, onEnded }) => {
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const audioRef = useRef<HTMLAudioElement>(null);

    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;

        const handleLoadedMetadata = () => {
            setDuration(audio.duration);
        };

        const handleTimeUpdate = () => {
            setCurrentTime(audio.currentTime);
        };

        const handleEnded = () => {
            setIsPlaying(false);
            setCurrentTime(0);
            onEnded?.();
        };

        audio.addEventListener('loadedmetadata', handleLoadedMetadata);
        audio.addEventListener('timeupdate', handleTimeUpdate);
        audio.addEventListener('ended', handleEnded);

        return () => {
            audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
            audio.removeEventListener('timeupdate', handleTimeUpdate);
            audio.removeEventListener('ended', handleEnded);
        };
    }, [onEnded]);

    const togglePlay = () => {
        if (audioRef.current) {
            if (isPlaying) {
                audioRef.current.pause();
            } else {
                audioRef.current.play();
            }
            setIsPlaying(!isPlaying);
        }
    };

    const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
        const time = parseFloat(e.target.value);
        if (audioRef.current) {
            audioRef.current.currentTime = time;
            setCurrentTime(time);
        }
    };

    return (
        <div className="flex flex-col gap-2">
            <audio ref={audioRef} src={audioUrl} />
            <div className="flex items-center gap-3">
                <button
                    onClick={togglePlay}
                    className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-white hover:from-indigo-600 hover:to-purple-600 transition-all shadow-lg"
                >
                    {isPlaying
                        ? <Pause className="h-4 w-4" />
                        : <Play className="h-4 w-4 ml-0.5" />
                    }
                </button>
                <div className="flex-1 flex items-center gap-2">
                    <span className="text-xs text-muted-foreground w-12">{formatDuration(Math.floor(currentTime))}</span>
                    <input
                        type="range"
                        min={0}
                        max={duration || 0}
                        value={currentTime}
                        onChange={handleSeek}
                        className="flex-1 h-1 bg-muted rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-gradient-to-r [&::-webkit-slider-thumb]:from-indigo-500 [&::-webkit-slider-thumb]:to-purple-500"
                    />
                    <span className="text-xs text-muted-foreground w-12">{formatDuration(Math.floor(duration))}</span>
                </div>
            </div>
        </div>
    );
};

const CalendarDayIcon: React.FC = () => {
    const day = new Date().getDate();
    return (
        <div className="w-6 h-6 rounded-md bg-muted flex items-center justify-center shrink-0 relative overflow-hidden">
            <Calendar className="h-4 w-4 text-muted-foreground absolute" />
            <span className="text-[8px] font-bold text-foreground relative z-10 mt-1.5">{day}</span>
        </div>
    );
};

type RecordingState = 'idle' | 'recording' | 'paused' | 'processing' | 'completed';
type ConsentMode = 'myself' | 'audio';

export const MeetingMinutesPanel: React.FC<{ editor: Editor }> = ({ editor }) => {
    const { t } = useTranslation();
    const m = useCallback((key: string) => t(`meetingMinutes.${key}`), [t]);
    const [isOpen, setIsOpen] = useState(false);
    const [state, setState] = useState<RecordingState>('idle');
    const [transcript, setTranscript] = useState('');
    const [summary, setSummary] = useState<string | null>(null);
    const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [consentMode, setConsentMode] = useState<ConsentMode>('myself');
    const [showConsentCard, setShowConsentCard] = useState(true);
    const panelRef = useRef<HTMLDivElement>(null);

    const fileService = useFileService();

    const {
        isRecording,
        isPaused,
        duration,
        audioUrl,
        startRecording,
        pauseRecording,
        resumeRecording,
        stopRecording,
    } = useMeetingRecorder({
        onTranscriptionUpdate: (text) => setTranscript(text),
        onTranscriptionComplete: (text) => setTranscript(text),
    });

    // Listen for open event
    useEffect(() => {
        const handleOpen = () => {
            if (!isOpen) {
                setIsOpen(true);
                setState('idle');
                setTranscript('');
                setSummary(null);
                setError(null);
            }
        };

        document.addEventListener(MEETING_MINUTES_PANEL_EVENT, handleOpen);
        return () => document.removeEventListener(MEETING_MINUTES_PANEL_EVENT, handleOpen);
    }, [isOpen]);

    // Handle escape key
    useEffect(() => {
        if (!isOpen) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && state !== 'recording' && state !== 'paused') {
                handleClose();
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, state]);

    // Handle click outside
    useEffect(() => {
        if (!isOpen || state === 'recording' || state === 'paused') return;

        const handleClickOutside = (e: MouseEvent) => {
            if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
                const triggerButton = document.querySelector('[data-meeting-minutes-trigger]');
                if (triggerButton && triggerButton.contains(e.target as Node)) {
                    return;
                }
                handleClose();
            }
        };

        const timer = setTimeout(() => {
            document.addEventListener('mousedown', handleClickOutside);
        }, 100);

        return () => {
            clearTimeout(timer);
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isOpen, state]);

    // Update state based on recording status
    useEffect(() => {
        if (isRecording) {
            setState('recording');
        } else if (isPaused) {
            setState('paused');
        }
    }, [isRecording, isPaused]);

    const handleStart = async () => {
        setState('recording');
        setTranscript('');
        setSummary(null);
        setError(null);
        await startRecording();
    };

    const handlePause = () => {
        pauseRecording();
        setState('paused');
    };

    const handleResume = () => {
        resumeRecording();
        setState('recording');
    };

    const handleStop = async () => {
        setState('processing');
        const result = await stopRecording();
        if (result) {
            setTranscript(result.transcript || m('noSpeechContent'));
            setState('completed');
        } else {
            setState('idle');
        }
    };

    const handleClose = useCallback(() => {
        if (state === 'recording' || state === 'paused') {
            stopRecording();
        }
        setIsOpen(false);
        setState('idle');
        setTranscript('');
        setSummary(null);
    }, [state, stopRecording]);

    const handleGenerateSummary = useCallback(async () => {
        if (!transcript) return;

        setIsGeneratingSummary(true);
        setSummary(null);

        try {
            const prompt = m('summaryPrompt').replace('{{transcript}}', transcript);

            // Use the editor's AI agent to generate summary
            const { stream } = useEditorAgentOptimized(editor);

            let summaryText = '';
            try {
                const { textStream } = await stream({ prompt });
                for await (const part of textStream) {
                    summaryText += part;
                    setSummary(summaryText);
                }
            } catch (err) {
                console.error('Error generating summary:', err);
                // Fallback to simple summary if AI fails
                setSummary(`[${m('summaryGenerationFailed')}]

${transcript.slice(0, 500)}${transcript.length > 500 ? '...' : ''}`);
            }
        } finally {
            setIsGeneratingSummary(false);
        }
    }, [transcript, editor]);

    const handleSaveToFile = useCallback(async () => {
        if (!audioUrl) return;

        try {
            // Convert audio URL to blob
            const response = await fetch(audioUrl);
            const blob = await response.blob();
            const fileName = `${m('recordingFilePrefix')}_${new Date().toLocaleDateString('zh-CN').replace(/\//g, '-')}_${new Date().toLocaleTimeString('zh-CN', { hour12: false }).replace(/:/g, '-')}.webm`;

            const file = new File([blob], fileName, { type: 'audio/webm' });
            await fileService.uploadFile(file);

            toast.success(m('audioSaved'));
        } catch (err) {
            console.error('Error saving file:', err);
            toast.error(m('saveFailed'));
        }
    }, [audioUrl, fileService]);

    const handleInsertToEditor = useCallback(() => {
        // Insert meeting minutes node with 3 child tab nodes
        editor.chain().focus().insertContent({
            type: 'meetingMinutes',
            attrs: {
                title: m('title'),
                transcript,
                createdAt: Date.now(),
                updatedAt: Date.now(),
                activeTab: 'summary',
            },
            content: [
                {
                    type: 'meetingTabSummary',
                    content: summary
                        ? [{ type: 'paragraph', content: [{ type: 'text', text: summary }] }]
                        : [{ type: 'paragraph' }]
                },
                {
                    type: 'meetingTabNotes',
                    content: [{ type: 'paragraph' }]
                },
                {
                    type: 'meetingTabTranscript',
                    content: transcript
                        ? [{ type: 'paragraph', content: [{ type: 'text', text: transcript }] }]
                        : [{ type: 'paragraph' }]
                }
            ]
        }).run();
        toast.success(m('insertedToDoc'));
        handleClose();
    }, [summary, transcript, editor, handleClose]);

    if (!isOpen) return null;

    return createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={handleClose} />

            {/* Panel */}
            <div
                ref={panelRef}
                className="relative w-[480px] max-h-[80vh] bg-background rounded-2xl shadow-2xl border border-border/50 overflow-hidden animate-in fade-in-0 zoom-in-95 duration-200 flex flex-col"
            >
                {/* Header */}
                <div className="relative flex items-center gap-1.5 px-5 pt-4 pb-2 shrink-0 border-b border-border">
                    <CalendarDayIcon />
                    <ChevronDown className="h-3 w-3 text-muted-foreground/60 shrink-0" />
                    <h2 className="text-base font-semibold text-foreground">{m('meetingTitle')}</h2>
                    <span className="text-sm text-blue-500 shrink-0 select-none">@{m('today')}</span>
                    <div className="flex-1" />
                    <button
                        onClick={handleClose}
                        className="h-7 w-7 rounded-md hover:bg-muted flex items-center justify-center transition-colors text-muted-foreground hover:text-foreground"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>

                {/* Navigation Bar */}
                <div className="px-5 py-2 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <button
                            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-muted text-sm text-foreground hover:bg-muted/80 transition-colors"
                        >
                            <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                            {m('notes')}
                        </button>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <button className="h-7 w-7 rounded-md hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors" title={m('tips')}>
                            <Lightbulb className="h-4 w-4" />
                        </button>
                        <button className="h-7 w-7 rounded-md hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors" title={m('settings')}>
                            <Settings className="h-4 w-4" />
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div className="relative px-5 pb-4 pt-2 flex-1 overflow-y-auto">
                    {/* Recording State */}
                    {state === 'idle' && (
                        <div className="flex flex-col py-2">
                            {/* How it works */}
                            <p className="text-sm text-muted-foreground font-medium mb-2">{m('howItWorks')}</p>
                            <ol className="text-sm text-muted-foreground space-y-1.5 list-decimal list-inside mb-4">
                                <li>{m('howItWorks1')}</li>
                                <li>{m('howItWorks2')}</li>
                                <li>{m('howItWorks3')}</li>
                            </ol>

                            {/* Start transcribing button */}
                            <Button onClick={handleStart} className="gap-1.5 bg-blue-500 hover:bg-blue-600 text-white rounded-md self-start">
                                <Mic className="h-4 w-4" />
                                {m('startTranscribing')}
                                <ChevronDown className="h-3 w-3" />
                            </Button>

                            {/* Notification Consent Card */}
                            {showConsentCard && (
                                <div className="mt-4 p-4 rounded-lg bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-500/20">
                                    <p className="text-sm font-semibold text-blue-600 dark:text-blue-400 mb-1.5">{m('consentTitle')}</p>
                                    <p className="text-xs text-blue-700/70 dark:text-blue-300/80 mb-3 leading-relaxed">
                                        {m('consentDesc')}
                                    </p>
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => setConsentMode('myself')}
                                            className={cn(
                                                "flex-1 px-3 py-1.5 rounded-md text-xs font-medium border transition-colors",
                                                consentMode === 'myself'
                                                    ? "border-blue-500 bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300"
                                                    : "border-blue-300 dark:border-blue-500/40 text-blue-500 dark:text-blue-300/60 hover:border-blue-500 hover:text-blue-700 dark:hover:border-blue-500/70 dark:hover:text-blue-300"
                                            )}
                                        >
                                            {m('consentMyself')}
                                        </button>
                                        <button
                                            onClick={() => setConsentMode('audio')}
                                            className={cn(
                                                "flex-1 px-3 py-1.5 rounded-md text-xs font-medium border transition-colors",
                                                consentMode === 'audio'
                                                    ? "border-blue-500 bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300"
                                                    : "border-blue-300 dark:border-blue-500/40 text-blue-500 dark:text-blue-300/60 hover:border-blue-500 hover:text-blue-700 dark:hover:border-blue-500/70 dark:hover:text-blue-300"
                                            )}
                                        >
                                            {m('consentAudio')}
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Recording / Paused State */}
                    {(state === 'recording' || state === 'paused') && (
                        <div className="flex flex-col py-2">
                            {/* Duration & Status */}
                            <div className="flex items-center gap-3 mb-3">
                                <div className={cn(
                                    "w-2 h-2 rounded-full",
                                    state === 'recording' ? "bg-red-500 animate-pulse" : "bg-yellow-500"
                                )} />
                                <span className="text-sm text-muted-foreground">
                                    {state === 'recording' ? m('transcribing') : m('paused')}
                                </span>
                                <span className="text-2xl font-mono font-semibold tabular-nums">
                                    {formatDuration(duration)}
                                </span>
                            </div>

                            {/* Waveform */}
                            <div className="w-full mb-4">
                                <WaveformIndicator isActive={state === 'recording'} />
                            </div>

                            {/* Live Transcript Preview (editable) */}
                            {transcript && (
                                <div className="w-full mb-4">
                                    <div className="flex items-center justify-between mb-1">
                                        <span className="text-xs text-muted-foreground">{m('liveTranscript')}</span>
                                        <span className="text-[10px] text-muted-foreground">{m('editable')}</span>
                                    </div>
                                    <textarea
                                        value={transcript}
                                        onChange={(e) => setTranscript(e.target.value)}
                                        className="w-full text-sm bg-muted/50 rounded-lg p-3 max-h-24 overflow-y-auto resize-none focus:outline-none focus:ring-1 focus:ring-blue-500/40 text-foreground/90 placeholder:text-muted-foreground"
                                        placeholder={m('transcriptWillAppear')}
                                        rows={3}
                                    />
                                </div>
                            )}

                            {/* Controls */}
                            <div className="flex items-center gap-2">
                                {state === 'recording' ? (
                                    <button onClick={handlePause} className="h-8 px-3 rounded-md bg-muted hover:bg-muted/80 text-sm text-foreground flex items-center gap-1.5 transition-colors">
                                        <Pause className="h-4 w-4" />
                                        {m('pause')}
                                    </button>
                                ) : (
                                    <button onClick={handleResume} className="h-8 px-3 rounded-md bg-muted hover:bg-muted/80 text-sm text-foreground flex items-center gap-1.5 transition-colors">
                                        <Play className="h-4 w-4" />
                                        {m('resume')}
                                    </button>
                                )}
                                <button onClick={handleStop} className="h-8 px-3 rounded-md bg-red-500 hover:bg-red-600 text-sm text-white flex items-center gap-1.5 transition-colors">
                                    <Square className="h-4 w-4" />
                                    {m('stop')}
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Processing State */}
                    {state === 'processing' && (
                        <div className="flex flex-col items-center py-8">
                            <Loader2 className="h-8 w-8 animate-spin text-blue-500 mb-3" />
                            <p className="text-sm text-muted-foreground">{m('processing')}</p>
                        </div>
                    )}

                    {/* Completed State */}
                    {state === 'completed' && (
                        <div className="flex flex-col gap-4 py-2">
                            {/* Audio Player */}
                            {audioUrl && (
                                <div className="p-3 bg-muted/50 rounded-lg">
                                    <p className="text-xs text-muted-foreground mb-2">{m('recordingPlayback')}</p>
                                    <AudioPlayer audioUrl={audioUrl} />
                                </div>
                            )}

                            {/* Transcript (editable) */}
                            <div className="p-3 bg-muted/50 rounded-lg">
                                <div className="flex items-center justify-between mb-2">
                                    <p className="text-xs text-muted-foreground">{m('transcript')}</p>
                                    <div className="flex items-center gap-2">
                                        {transcript && <span className="text-xs text-muted-foreground">{transcript.length} {m('chars')}</span>}
                                        <span className="text-[10px] text-muted-foreground">{m('editable')}</span>
                                    </div>
                                </div>
                                <textarea
                                    value={transcript}
                                    onChange={(e) => setTranscript(e.target.value)}
                                    className="w-full text-sm bg-transparent whitespace-pre-wrap max-h-32 overflow-y-auto resize-none focus:outline-none focus:ring-1 focus:ring-blue-500/40 rounded p-1 text-foreground/90 placeholder:text-muted-foreground"
                                    placeholder={m('noSpeechContent')}
                                    rows={4}
                                />
                            </div>

                            {/* Summary */}
                            {summary && (
                                <div className="p-3 bg-blue-50 dark:bg-blue-950/50 rounded-lg border border-blue-200 dark:border-blue-500/20">
                                    <div className="flex items-center gap-2 mb-2">
                                        <Sparkles className="h-4 w-4 text-blue-500 dark:text-blue-400" />
                                        <p className="text-xs text-blue-600 dark:text-blue-300">{m('aiSummary')}</p>
                                    </div>
                                    <p className="text-sm whitespace-pre-wrap">{summary}</p>
                                </div>
                            )}

                            {/* Generate Summary Button */}
                            {!summary && !isGeneratingSummary && transcript && (
                                <Button
                                    variant="outline"
                                    onClick={handleGenerateSummary}
                                    className="gap-2 border-blue-300 dark:border-blue-500/40 text-blue-600 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-950/30 hover:text-blue-700 dark:hover:text-blue-200"
                                >
                                    <Sparkles className="h-4 w-4 text-blue-500 dark:text-blue-400" />
                                    {m('generateAISummary')}
                                </Button>
                            )}

                            {/* Generating Summary */}
                            {isGeneratingSummary && (
                                <div className="flex items-center gap-2 py-2">
                                    <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
                                    <span className="text-sm text-muted-foreground">{m('generatingSummary')}</span>
                                </div>
                            )}

                            {/* Action Buttons */}
                            <div className="flex gap-2 pt-2">
                                <Button
                                    variant="outline"
                                    onClick={handleSaveToFile}
                                    className="flex-1 gap-2"
                                    disabled={!audioUrl}
                                >
                                    <FileAudio className="h-4 w-4" />
                                    {m('saveRecording')}
                                </Button>
                                <Button
                                    onClick={handleInsertToEditor}
                                    className="flex-1 gap-2 bg-blue-500 hover:bg-blue-600 text-white"
                                >
                                    <CheckCircle2 className="h-4 w-4" />
                                    {m('insertToDocument')}
                                </Button>
                            </div>

                            {/* New Recording */}
                            <Button
                                variant="ghost"
                                onClick={() => {
                                    setState('idle');
                                    setTranscript('');
                                    setSummary(null);
                                }}
                                className="w-full"
                            >
                                {m('newRecording')}
                            </Button>
                        </div>
                    )}

                    {/* Error */}
                    {error && (
                        <div className="mt-2 px-3 py-2 rounded-lg bg-destructive/10 text-destructive text-xs text-center">
                            {error}
                        </div>
                    )}
                </div>

                {/* ── Footer ── */}
                <div className="px-5 py-2 border-t border-border flex items-center text-xs text-muted-foreground select-none gap-2 shrink-0">
                    <span>{m('instructions')}</span>
                    <button className="inline-flex items-center gap-0.5 font-semibold text-foreground hover:text-foreground/80 transition-colors">
                        {m('auto')}
                        <ChevronDown className="h-3 w-3" />
                    </button>
                    <div className="w-px h-3 bg-border mx-1" />
                    <span className="flex-1 truncate">{m('consentNote')}</span>
                    <div className="flex items-center gap-1 shrink-0">
                        <button className="h-5 w-5 rounded hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors" title={m('volume')}>
                            <Volume2 className="h-3 w-3" />
                        </button>
                        <button className="h-5 w-5 rounded hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors" title={m('copy')}>
                            <Copy className="h-3 w-3" />
                        </button>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
};
