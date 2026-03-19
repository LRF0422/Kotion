import { Mic, MicOff, Pause, Play, Square, X, FileAudio, Sparkles, CheckCircle2, Loader2 } from "@kn/icon";
import { Button } from "@kn/ui";
import { cn } from "@kn/ui";
import React, { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { useMeetingRecorder } from "../../hooks/useMeetingRecorder";
import { Editor } from "@kn/editor";
import { useEditorAgentOptimized } from "@kn/core";
import { toast } from "@kn/ui";
import { useFileService } from "@kn/core";

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

type RecordingState = 'idle' | 'recording' | 'paused' | 'processing' | 'completed';

export const MeetingMinutesPanel: React.FC<{ editor: Editor }> = ({ editor }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [state, setState] = useState<RecordingState>('idle');
    const [transcript, setTranscript] = useState('');
    const [summary, setSummary] = useState<string | null>(null);
    const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
    const [error, setError] = useState<string | null>(null);
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
            setTranscript(result.transcript || '（无语音内容）');
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
            const prompt = `请为以下会议录音转录内容生成会议摘要，包括：
1. 会议主题/标题
2. 主要讨论内容（按要点列出）
3. 会议结论/决议
4. 待办事项（如有）

转录内容：
${transcript}

请用中文回复，格式清晰易读。`;

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
                setSummary(`[AI摘要生成失败，以下为转录内容预览]\n\n${transcript.slice(0, 500)}${transcript.length > 500 ? '...' : ''}`);
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
            const fileName = `会议录音_${new Date().toLocaleDateString('zh-CN').replace(/\//g, '-')}_${new Date().toLocaleTimeString('zh-CN', { hour12: false }).replace(/:/g, '-')}.webm`;

            const file = new File([blob], fileName, { type: 'audio/webm' });
            await fileService.uploadFile(file);

            toast.success('录音已保存到文件管理中心');
        } catch (err) {
            console.error('Error saving file:', err);
            toast.error('保存失败，请重试');
        }
    }, [audioUrl, fileService]);

    const handleInsertToEditor = useCallback(() => {
        // Insert meeting minutes node with content
        editor.chain().focus().insertContent({
            type: 'meetingMinutes',
            attrs: {
                title: '会议纪要',
                transcript,
                createdAt: Date.now(),
                updatedAt: Date.now(),
            },
            content: summary
                ? [{ type: 'paragraph', content: [{ type: 'text', text: summary }] }]
                : [{ type: 'paragraph', content: transcript ? [{ type: 'text', text: transcript }] : undefined }]
        }).run();
        toast.success('已插入到文档');
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
                {/* Gradient header */}
                <div className="absolute top-0 left-0 right-0 h-24 bg-gradient-to-br from-indigo-500/10 via-purple-500/10 to-transparent pointer-events-none" />

                {/* Header */}
                <div className="relative flex items-center justify-between px-4 pt-4 pb-2 shrink-0">
                    <div className="flex items-center gap-2">
                        <div className="relative">
                            <div className="absolute inset-0 bg-gradient-to-br from-indigo-500 to-purple-500 rounded-xl blur-md opacity-30" />
                            <div className="relative p-2 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-500 shadow-lg shadow-indigo-500/20">
                                <FileAudio className="h-4 w-4 text-white" />
                            </div>
                        </div>
                        <h2 className="text-base font-semibold text-foreground">会议纪要</h2>
                    </div>
                    <button
                        onClick={handleClose}
                        className="h-8 w-8 rounded-full hover:bg-muted flex items-center justify-center transition-colors text-muted-foreground hover:text-foreground"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>

                {/* Content */}
                <div className="relative px-4 pb-4 pt-2 flex-1 overflow-y-auto">
                    {/* Recording State */}
                    {state === 'idle' && (
                        <div className="flex flex-col items-center py-8">
                            <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center mb-4">
                                <Mic className="h-8 w-8 text-muted-foreground" />
                            </div>
                            <p className="text-sm text-muted-foreground mb-4">点击开始录制会议</p>
                            <Button onClick={handleStart} className="gap-2 bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600">
                                <Mic className="h-4 w-4" />
                                开始录音
                            </Button>
                        </div>
                    )}

                    {/* Recording / Paused State */}
                    {(state === 'recording' || state === 'paused') && (
                        <div className="flex flex-col items-center py-4">
                            {/* Duration */}
                            <div className="text-3xl font-mono font-semibold mb-2">
                                {formatDuration(duration)}
                            </div>
                            <p className="text-sm text-muted-foreground mb-4">
                                {state === 'recording' ? '正在录音...' : '已暂停'}
                            </p>

                            {/* Waveform */}
                            <div className="w-full mb-4">
                                <WaveformIndicator isActive={state === 'recording'} />
                            </div>

                            {/* Live Transcript Preview */}
                            {transcript && (
                                <div className="w-full mb-4 p-3 bg-muted/50 rounded-lg max-h-24 overflow-y-auto">
                                    <p className="text-xs text-muted-foreground">实时转录：</p>
                                    <p className="text-sm mt-1 line-clamp-3">{transcript}</p>
                                </div>
                            )}

                            {/* Controls */}
                            <div className="flex items-center gap-3">
                                {state === 'recording' ? (
                                    <>
                                        <button
                                            onClick={handlePause}
                                            className="w-12 h-12 rounded-full bg-muted hover:bg-muted/80 flex items-center justify-center transition-colors"
                                        >
                                            <Pause className="h-5 w-5" />
                                        </button>
                                        <button
                                            onClick={handleStop}
                                            className="w-14 h-14 rounded-full bg-gradient-to-br from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 flex items-center justify-center text-white transition-all shadow-lg"
                                        >
                                            <Square className="h-5 w-5" />
                                        </button>
                                    </>
                                ) : (
                                    <>
                                        <button
                                            onClick={handleResume}
                                            className="w-12 h-12 rounded-full bg-muted hover:bg-muted/80 flex items-center justify-center transition-colors"
                                        >
                                            <Play className="h-5 w-5 ml-0.5" />
                                        </button>
                                        <button
                                            onClick={handleStop}
                                            className="w-14 h-14 rounded-full bg-gradient-to-br from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 flex items-center justify-center text-white transition-all shadow-lg"
                                        >
                                            <Square className="h-5 w-5" />
                                        </button>
                                    </>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Processing State */}
                    {state === 'processing' && (
                        <div className="flex flex-col items-center py-8">
                            <Loader2 className="h-10 w-10 animate-spin text-indigo-500 mb-4" />
                            <p className="text-sm text-muted-foreground">处理中...</p>
                        </div>
                    )}

                    {/* Completed State */}
                    {state === 'completed' && (
                        <div className="flex flex-col gap-4 py-2">
                            {/* Audio Player */}
                            {audioUrl && (
                                <div className="p-3 bg-muted/50 rounded-lg">
                                    <p className="text-xs text-muted-foreground mb-2">录音回放</p>
                                    <AudioPlayer audioUrl={audioUrl} />
                                </div>
                            )}

                            {/* Transcript */}
                            <div className="p-3 bg-muted/50 rounded-lg">
                                <div className="flex items-center justify-between mb-2">
                                    <p className="text-xs text-muted-foreground">录音转录</p>
                                    {transcript && <span className="text-xs text-muted-foreground">{transcript.length} 字</span>}
                                </div>
                                <p className="text-sm whitespace-pre-wrap max-h-32 overflow-y-auto">
                                    {transcript || '（无语音内容）'}
                                </p>
                            </div>

                            {/* Summary */}
                            {summary && (
                                <div className="p-3 bg-gradient-to-br from-indigo-50/50 to-purple-50/50 dark:from-indigo-950/30 dark:to-purple-950/30 rounded-lg border border-indigo-200/60 dark:border-indigo-800/60">
                                    <div className="flex items-center gap-2 mb-2">
                                        <Sparkles className="h-4 w-4 text-indigo-500" />
                                        <p className="text-xs text-muted-foreground">AI 摘要</p>
                                    </div>
                                    <p className="text-sm whitespace-pre-wrap">{summary}</p>
                                </div>
                            )}

                            {/* Generate Summary Button */}
                            {!summary && !isGeneratingSummary && transcript && (
                                <Button
                                    variant="outline"
                                    onClick={handleGenerateSummary}
                                    className="gap-2 border-indigo-200 dark:border-indigo-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/30"
                                >
                                    <Sparkles className="h-4 w-4 text-indigo-500" />
                                    生成会议摘要
                                </Button>
                            )}

                            {/* Generating Summary */}
                            {isGeneratingSummary && (
                                <div className="flex items-center gap-2 justify-center py-2">
                                    <Loader2 className="h-4 w-4 animate-spin text-indigo-500" />
                                    <span className="text-sm text-muted-foreground">正在生成摘要...</span>
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
                                    保存录音
                                </Button>
                                <Button
                                    onClick={handleInsertToEditor}
                                    className="flex-1 gap-2 bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600"
                                >
                                    <CheckCircle2 className="h-4 w-4" />
                                    插入文档
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
                                重新录制
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
            </div>
        </div>,
        document.body
    );
};
