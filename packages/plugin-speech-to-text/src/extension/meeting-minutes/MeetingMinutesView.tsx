import { NodeViewProps, NodeViewWrapper, NodeViewContent, Editor } from "@kn/editor";
import React, { useState, useEffect, useRef, useCallback } from "react";
import { useMeetingRecorder } from "../../hooks/useMeetingRecorder";
import { useFileService, useEditorAgentOptimized } from "@kn/core";
import { Button } from "@kn/ui";
import { cn } from "@kn/ui";
import { toast } from "@kn/ui";
import {
    Mic, Pause, Play, Square, Sparkles,
    Loader2, Save, RotateCcw, Calendar, Share2,
    PenLine, ListTree, ThumbsUp, ThumbsDown, ChevronDown
} from "@kn/icon";

// ─── Helpers ────────────────────────────────────────────

const formatDuration = (seconds: number): string => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hrs > 0) {
        return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

const formatDate = (timestamp: number | null): string => {
    if (!timestamp) return '今天';
    const date = new Date(timestamp);
    const now = new Date();
    if (date.toDateString() === now.toDateString()) return '今天';
    return date.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' });
};

// ─── Audio Player ───────────────────────────────────────

interface AudioPlayerProps {
    audioUrl: string;
}

const AudioPlayer: React.FC<AudioPlayerProps> = ({ audioUrl }) => {
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [dur, setDur] = useState(0);
    const audioRef = useRef<HTMLAudioElement>(null);

    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;
        const onMeta = () => setDur(audio.duration);
        const onTime = () => setCurrentTime(audio.currentTime);
        const onEnd = () => { setIsPlaying(false); setCurrentTime(0); };
        audio.addEventListener('loadedmetadata', onMeta);
        audio.addEventListener('timeupdate', onTime);
        audio.addEventListener('ended', onEnd);
        return () => {
            audio.removeEventListener('loadedmetadata', onMeta);
            audio.removeEventListener('timeupdate', onTime);
            audio.removeEventListener('ended', onEnd);
        };
    }, []);

    const togglePlay = () => {
        if (!audioRef.current) return;
        if (isPlaying) audioRef.current.pause();
        else audioRef.current.play();
        setIsPlaying(!isPlaying);
    };

    const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
        const t = parseFloat(e.target.value);
        if (audioRef.current) { audioRef.current.currentTime = t; setCurrentTime(t); }
    };

    return (
        <div className="flex items-center gap-2.5">
            <audio ref={audioRef} src={audioUrl} />
            <button
                onClick={togglePlay}
                className="w-7 h-7 shrink-0 rounded-full bg-blue-500 hover:bg-blue-600 flex items-center justify-center text-white transition-colors"
            >
                {isPlaying ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3 ml-px" />}
            </button>
            <span className="text-[11px] text-muted-foreground tabular-nums shrink-0">{formatDuration(Math.floor(currentTime))}</span>
            <input
                type="range" min={0} max={dur || 0} value={currentTime} onChange={handleSeek}
                className="flex-1 h-1 bg-muted rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:h-2.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-blue-500"
            />
            <span className="text-[11px] text-muted-foreground tabular-nums shrink-0">{formatDuration(Math.floor(dur))}</span>
        </div>
    );
};

// ─── Types ──────────────────────────────────────────────

type RecordingState = 'idle' | 'recording' | 'paused' | 'processing' | 'completed';
type MeetingTab = 'summary' | 'notes' | 'transcript';

// ─── Main View ──────────────────────────────────────────

export const MeetingMinutesView: React.FC<NodeViewProps> = (props) => {
    const { node, editor, updateAttributes, getPos } = props;

    const {
        isRecording, isPaused, duration,
        startRecording, pauseRecording, resumeRecording, stopRecording,
    } = useMeetingRecorder();

    const fileService = useFileService();

    const [state, setState] = useState<RecordingState>(() =>
        node.attrs.isRecording ? 'recording' :
            (node.attrs.transcript ? 'completed' : 'idle')
    );
    const [transcript, setTranscript] = useState(node.attrs.transcript || '');
    const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
    const [localAudioUrl, setLocalAudioUrl] = useState<string | null>(node.attrs.audioUrl || null);
    const [activeTab, setActiveTab] = useState<MeetingTab>((node.attrs.activeTab as MeetingTab) || 'summary');
    const [feedbackGiven, setFeedbackGiven] = useState<'up' | 'down' | null>(null);
    const [isEditingTitle, setIsEditingTitle] = useState(false);
    const titleInputRef = useRef<HTMLInputElement>(null);

    // Recording state sync
    useEffect(() => {
        if (isRecording) setState('recording');
        else if (isPaused) setState('paused');
    }, [isRecording, isPaused]);

    // Sync transcript to node
    useEffect(() => {
        if (transcript !== node.attrs.transcript) {
            updateAttributes({ transcript, updatedAt: Date.now() });
        }
    }, [transcript]);

    // Sync active tab
    useEffect(() => {
        if (activeTab !== node.attrs.activeTab) {
            updateAttributes({ activeTab });
        }
    }, [activeTab]);

    // ─── Recording Handlers ─────────────────────────────

    const handleStart = async () => {
        setState('recording');
        setTranscript('');
        setLocalAudioUrl(null);
        updateAttributes({ isRecording: true, isPaused: false, duration: 0 });
        await startRecording();
    };

    const handlePause = () => {
        pauseRecording();
        updateAttributes({ isPaused: true });
    };

    const handleResume = () => {
        resumeRecording();
        updateAttributes({ isPaused: false });
    };

    const handleStop = async () => {
        updateAttributes({ isRecording: false, isPaused: false });
        setState('processing');
        const result = await stopRecording();
        if (result) {
            const t = result.transcript || '';
            setTranscript(t);
            setLocalAudioUrl(result.audioBlob ? URL.createObjectURL(result.audioBlob) : null);
            setState('completed');
        } else {
            setState('idle');
        }
    };

    // ─── AI Summary ─────────────────────────────────────

    const handleGenerateSummary = useCallback(async () => {
        if (!transcript) return;
        setIsGeneratingSummary(true);
        setActiveTab('summary');

        try {
            const prompt = `请为以下会议录音转录内容生成会议摘要，包括：
1. 会议主题/标题
2. 主要讨论内容（按要点列出）
3. 会议结论/决议
4. 待办事项（如有）

转录内容：
${transcript}

请用 Markdown 格式回复，格式清晰易读。`;

            const { stream } = useEditorAgentOptimized(editor as Editor);

            // Clear existing content and insert placeholder
            const pos = getPos();
            if (typeof pos === 'number') {
                editor.chain().focus()
                    .deleteRange({ from: pos + 1, to: pos + node.nodeSize - 1 })
                    .insertContentAt(pos + 1, { type: 'paragraph' })
                    .run();
            }

            let summaryText = '';
            try {
                const { textStream } = await stream({ prompt });
                for await (const part of textStream) {
                    summaryText += part;
                }
            } catch (err) {
                console.error('Error generating summary:', err);
                summaryText = `**[AI摘要生成失败]**\n\n${transcript.slice(0, 500)}${transcript.length > 500 ? '...' : ''}`;
            }

            // Insert generated summary into the node's content
            if (typeof pos === 'number' && summaryText) {
                editor.chain().focus()
                    .deleteRange({ from: pos + 1, to: pos + node.nodeSize - 1 })
                    .insertContentAt(pos + 1, summaryText, {
                        applyInputRules: false,
                        applyPasteRules: false,
                        parseOptions: { preserveWhitespace: false }
                    })
                    .run();
            }
        } finally {
            setIsGeneratingSummary(false);
        }
    }, [transcript, editor, getPos, node]);

    // ─── Insert Transcript ──────────────────────────────

    const handleInsertTranscript = useCallback(() => {
        if (!transcript) return;
        const pos = getPos();
        if (typeof pos === 'number') {
            editor.chain().focus()
                .deleteRange({ from: pos + 1, to: pos + node.nodeSize - 1 })
                .insertContentAt(pos + 1, `## 录音转录\n\n${transcript}`, {
                    applyInputRules: false,
                    applyPasteRules: false,
                    parseOptions: { preserveWhitespace: false }
                })
                .run();
            setActiveTab('summary');
        }
    }, [transcript, editor, getPos, node]);

    // ─── File & Share ───────────────────────────────────

    const handleSaveToFile = useCallback(async () => {
        if (!localAudioUrl) return;
        try {
            const response = await fetch(localAudioUrl);
            const blob = await response.blob();
            const fileName = `会议录音_${new Date().toLocaleDateString('zh-CN').replace(/\//g, '-')}_${new Date().toLocaleTimeString('zh-CN', { hour12: false }).replace(/:/g, '-')}.webm`;
            const file = new File([blob], fileName, { type: 'audio/webm' });
            const result = await fileService.uploadFile(file);
            updateAttributes({ audioPath: result.path });
            toast.success('录音已保存');
        } catch (err) {
            console.error('Error saving file:', err);
            toast.error('保存失败');
        }
    }, [localAudioUrl, fileService, updateAttributes]);

    const handleShareSummary = useCallback(() => {
        const title = node.attrs.title || '会议纪要';
        const content = `# ${title}\n\n${transcript ? `## 转录\n${transcript}` : ''}`;
        navigator.clipboard.writeText(content).then(() => {
            toast.success('已复制到剪贴板');
        }).catch(() => toast.error('复制失败'));
    }, [transcript, node.attrs.title]);

    const handleReset = () => {
        setState('idle');
        setTranscript('');
        setLocalAudioUrl(null);
        setFeedbackGiven(null);
        updateAttributes({
            isRecording: false, isPaused: false, duration: 0,
            audioPath: null, audioUrl: null, transcript: ''
        });
        // Reset node content to empty paragraph
        const pos = getPos();
        if (typeof pos === 'number') {
            editor.chain()
                .deleteRange({ from: pos + 1, to: pos + node.nodeSize - 1 })
                .insertContentAt(pos + 1, { type: 'paragraph' })
                .run();
        }
    };

    // ─── Title Editing ──────────────────────────────────

    const handleTitleClick = useCallback(() => {
        setIsEditingTitle(true);
        setTimeout(() => titleInputRef.current?.focus(), 0);
    }, []);

    const handleTitleBlur = useCallback(() => {
        setIsEditingTitle(false);
    }, []);

    const handleTitleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        updateAttributes({ title: e.target.value, updatedAt: Date.now() });
    }, [updateAttributes]);

    const handleTitleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            setIsEditingTitle(false);
        }
    }, []);

    const meetingTitle = node.attrs.title || '会议纪要';

    // ─── Tab definitions ────────────────────────────────

    const tabs: { key: MeetingTab; label: string; icon: React.ReactNode }[] = [
        { key: 'summary', label: '摘要', icon: <Sparkles className="h-3.5 w-3.5" /> },
        { key: 'notes', label: '笔记', icon: <PenLine className="h-3.5 w-3.5" /> },
        { key: 'transcript', label: '转录', icon: <ListTree className="h-3.5 w-3.5" /> },
    ];

    // ─── Render: Idle ───────────────────────────────────

    if (state === 'idle') {
        return (
            <NodeViewWrapper as="div" className="my-4 not-prose">
                <div className="w-full rounded-lg border border-border bg-card overflow-hidden">
                    {/* Title bar */}
                    <div className="px-4 py-3 flex items-center gap-2 border-b border-border/60">
                        <div className="w-6 h-6 rounded bg-muted flex items-center justify-center shrink-0">
                            <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                        </div>
                        <span className="text-base font-semibold text-foreground">{meetingTitle}</span>
                    </div>
                    {/* Empty body */}
                    <div className="flex flex-col items-center justify-center py-10 gap-3">
                        <div className="w-12 h-12 rounded-full bg-muted/60 flex items-center justify-center">
                            <Mic className="h-6 w-6 text-muted-foreground/70" />
                        </div>
                        <p className="text-sm text-muted-foreground">点击开始录制会议</p>
                        <Button onClick={handleStart} size="sm" className="gap-1.5">
                            <Mic className="h-3.5 w-3.5" />
                            开始录音
                        </Button>
                    </div>
                    {/* Hidden NodeViewContent to satisfy ProseMirror content requirement */}
                    <div className="hidden">
                        <NodeViewContent />
                    </div>
                </div>
            </NodeViewWrapper>
        );
    }

    // ─── Render: Recording / Paused ─────────────────────

    if (state === 'recording' || state === 'paused') {
        return (
            <NodeViewWrapper as="div" className="my-4 not-prose">
                <div className="w-full rounded-lg border border-blue-500/30 bg-card overflow-hidden">
                    <div className="px-4 py-3 flex items-center gap-2 border-b border-border/60">
                        <div className="w-6 h-6 rounded bg-muted flex items-center justify-center shrink-0">
                            <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                        </div>
                        <span className="text-base font-semibold text-foreground">{meetingTitle}</span>
                    </div>

                    <div className="p-5 flex flex-col items-center gap-4">
                        <div className="flex items-center gap-3">
                            <div className={cn(
                                "w-2.5 h-2.5 rounded-full",
                                state === 'recording' ? "bg-red-500 animate-pulse" : "bg-yellow-500"
                            )} />
                            <span className="text-sm text-muted-foreground">
                                {state === 'recording' ? '正在录音' : '已暂停'}
                            </span>
                            <span className="text-2xl font-mono font-semibold tabular-nums">
                                {formatDuration(duration)}
                            </span>
                        </div>

                        {transcript && (
                            <div className="w-full p-3 bg-muted/40 rounded-md max-h-20 overflow-y-auto">
                                <p className="text-xs text-muted-foreground mb-1">实时转录</p>
                                <p className="text-sm line-clamp-2">{transcript}</p>
                            </div>
                        )}

                        <div className="flex items-center gap-3">
                            {state === 'recording' ? (
                                <button onClick={handlePause} className="w-11 h-11 rounded-full bg-muted hover:bg-muted/80 flex items-center justify-center transition-colors">
                                    <Pause className="h-5 w-5" />
                                </button>
                            ) : (
                                <button onClick={handleResume} className="w-11 h-11 rounded-full bg-muted hover:bg-muted/80 flex items-center justify-center transition-colors">
                                    <Play className="h-5 w-5 ml-0.5" />
                                </button>
                            )}
                            <button onClick={handleStop} className="w-12 h-12 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center text-white transition-colors shadow-md">
                                <Square className="h-5 w-5" />
                            </button>
                        </div>
                    </div>

                    <div className="hidden"><NodeViewContent /></div>
                </div>
            </NodeViewWrapper>
        );
    }

    // ─── Render: Processing ─────────────────────────────

    if (state === 'processing') {
        return (
            <NodeViewWrapper as="div" className="my-4 not-prose">
                <div className="w-full rounded-lg border border-border bg-card overflow-hidden">
                    <div className="px-4 py-3 flex items-center gap-2 border-b border-border/60">
                        <div className="w-6 h-6 rounded bg-muted flex items-center justify-center shrink-0">
                            <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                        </div>
                        <span className="text-base font-semibold text-foreground">{meetingTitle}</span>
                    </div>
                    <div className="flex flex-col items-center justify-center py-10 gap-3">
                        <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
                        <p className="text-sm text-muted-foreground">处理中…</p>
                    </div>
                    <div className="hidden"><NodeViewContent /></div>
                </div>
            </NodeViewWrapper>
        );
    }

    // ─── Render: Completed (Notion-like) ────────────────

    return (
        <NodeViewWrapper as="div" className="my-4 not-prose">
            <div className="w-full rounded-lg border border-border bg-card overflow-hidden shadow-sm">

                {/* ── Title Bar ── */}
                <div className="px-5 pt-4 pb-3 flex items-center gap-1.5">
                    <div className="w-7 h-7 rounded-md bg-muted flex items-center justify-center shrink-0">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <ChevronDown className="h-3 w-3 text-muted-foreground/60 shrink-0" />

                    {isEditingTitle ? (
                        <input
                            ref={titleInputRef}
                            value={node.attrs.title || ''}
                            onChange={handleTitleChange}
                            onBlur={handleTitleBlur}
                            onKeyDown={handleTitleKeyDown}
                            className="text-lg font-semibold text-foreground bg-transparent outline-none border-none flex-1 min-w-0"
                            placeholder="会议标题…"
                        />
                    ) : (
                        <h3
                            className="text-lg font-semibold text-foreground truncate cursor-text flex-1 min-w-0"
                            onClick={handleTitleClick}
                        >
                            {meetingTitle}
                        </h3>
                    )}

                    <span className="text-sm text-blue-500 shrink-0 ml-1 select-none">
                        @{formatDate(node.attrs.createdAt)}
                    </span>
                </div>

                {/* ── Tab Bar ── */}
                <div className="px-5 flex items-center justify-between border-b border-border">
                    <div className="flex items-center gap-0">
                        {tabs.map((tab) => (
                            <button
                                key={tab.key}
                                onClick={() => setActiveTab(tab.key)}
                                className={cn(
                                    "inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 transition-colors select-none",
                                    activeTab === tab.key
                                        ? "border-blue-500 text-foreground"
                                        : "border-transparent text-muted-foreground hover:text-foreground"
                                )}
                            >
                                {tab.icon}
                                {tab.label}
                            </button>
                        ))}
                    </div>
                    <div className="flex items-center gap-0.5">
                        <button onClick={handleReset} className="h-7 w-7 rounded-md hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors" title="重新录制">
                            <RotateCcw className="h-3.5 w-3.5" />
                        </button>
                        {localAudioUrl && (
                            <button onClick={handleSaveToFile} className="h-7 w-7 rounded-md hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors" title="保存录音">
                                <Save className="h-3.5 w-3.5" />
                            </button>
                        )}
                        <Button size="sm" onClick={handleShareSummary} className="ml-1.5 h-7 text-xs gap-1 bg-blue-500 hover:bg-blue-600 text-white rounded-md px-3">
                            <Share2 className="h-3 w-3" />
                            分享摘要
                        </Button>
                    </div>
                </div>

                {/* ── Tab Content ── */}
                <div className="min-h-[100px]">

                    {/* Summary / Notes tab → Editor content */}
                    {(activeTab === 'summary' || activeTab === 'notes') && (
                        <div>
                            {/* Audio player */}
                            {localAudioUrl && (
                                <div className="mx-5 mt-4 p-2.5 bg-muted/30 rounded-md">
                                    <AudioPlayer audioUrl={localAudioUrl} />
                                </div>
                            )}

                            {/* Generate summary prompt */}
                            {activeTab === 'summary' && !isGeneratingSummary && transcript && (
                                <div className="mx-5 mt-3">
                                    <Button variant="outline" size="sm" onClick={handleGenerateSummary} className="gap-1.5 text-xs h-7">
                                        <Sparkles className="h-3.5 w-3.5 text-blue-500" />
                                        生成 AI 摘要
                                    </Button>
                                </div>
                            )}

                            {/* Generating indicator */}
                            {isGeneratingSummary && (
                                <div className="mx-5 mt-3 flex items-center gap-2">
                                    <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-500" />
                                    <span className="text-xs text-muted-foreground">正在生成摘要…</span>
                                </div>
                            )}

                            {/* Editable content via editor */}
                            <div className="px-5 py-3">
                                <NodeViewContent className="min-h-[60px] prose prose-sm dark:prose-invert max-w-none focus:outline-none prose-p:my-1.5 prose-headings:mt-4 prose-headings:mb-2 prose-ul:my-1.5 prose-ol:my-1.5 prose-li:my-0.5" />
                            </div>
                        </div>
                    )}

                    {/* Transcript tab → read-only transcript with option to insert */}
                    {activeTab === 'transcript' && (
                        <div className="p-5">
                            {localAudioUrl && (
                                <div className="mb-4 p-2.5 bg-muted/30 rounded-md">
                                    <AudioPlayer audioUrl={localAudioUrl} />
                                </div>
                            )}
                            <div className="flex items-center justify-between mb-3">
                                <span className="text-xs font-medium text-muted-foreground">录音转录</span>
                                <div className="flex items-center gap-2">
                                    {transcript && (
                                        <span className="text-xs text-muted-foreground">{transcript.length} 字</span>
                                    )}
                                    <Button
                                        variant="ghost" size="sm"
                                        onClick={handleInsertTranscript}
                                        className="h-6 text-xs gap-1 px-2"
                                    >
                                        <PenLine className="h-3 w-3" />
                                        插入到编辑区
                                    </Button>
                                </div>
                            </div>
                            <div className="text-sm leading-relaxed text-foreground/80 whitespace-pre-wrap bg-muted/20 rounded-md p-3 max-h-[300px] overflow-y-auto">
                                {transcript || '（无语音内容）'}
                            </div>
                            {/* NodeViewContent must stay in DOM, keep it hidden */}
                            <div className="h-0 overflow-hidden"><NodeViewContent /></div>
                        </div>
                    )}
                </div>

                {/* ── Footer ── */}
                <div className="px-5 py-2.5 border-t border-border flex items-center text-xs text-muted-foreground select-none">
                    <span>时长:&nbsp;</span>
                    <span className="font-medium text-foreground tabular-nums">{formatDuration(duration)}</span>
                    <div className="w-px h-3.5 bg-border mx-3" />
                    <span>该摘要有帮助吗？</span>
                    <button
                        onClick={() => setFeedbackGiven(feedbackGiven === 'up' ? null : 'up')}
                        className={cn("ml-2 h-6 w-6 rounded flex items-center justify-center transition-colors",
                            feedbackGiven === 'up' ? "text-blue-500 bg-blue-500/10" : "hover:bg-muted hover:text-foreground"
                        )}
                    >
                        <ThumbsUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                        onClick={() => setFeedbackGiven(feedbackGiven === 'down' ? null : 'down')}
                        className={cn("h-6 w-6 rounded flex items-center justify-center transition-colors",
                            feedbackGiven === 'down' ? "text-orange-500 bg-orange-500/10" : "hover:bg-muted hover:text-foreground"
                        )}
                    >
                        <ThumbsDown className="h-3.5 w-3.5" />
                    </button>
                </div>
            </div>
        </NodeViewWrapper>
    );
};
