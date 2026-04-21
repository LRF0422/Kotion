import { NodeViewProps, NodeViewWrapper, NodeViewContent, Editor, Node as PMNode } from "@kn/editor";
import React, { useState, useEffect, useRef, useCallback } from "react";
import { useMeetingRecorder } from "../../hooks/useMeetingRecorder";
import { useFileService, useEditorAgentOptimized } from "@kn/core";
import { Button } from "@kn/ui";
import { cn } from "@kn/ui";
import { toast } from "@kn/ui";
import {
    Mic, Pause, Play, Square, Sparkles,
    Loader2, Save, RotateCcw, Calendar, Share2,
    PenLine, ListTree, ThumbsUp, ThumbsDown, ChevronDown,
    Lightbulb, Settings, Volume2, Copy, Pencil
} from "@kn/icon";

// ─── Tab Visibility CSS ───────────────────────────────
// The parent div has data-active-tab="summary|notes|transcript".
// Each child tab node renders a div with data-tab="summary|notes|transcript".
// Only the active tab's content is visible and editable.

// ─── Tab Visibility CSS ───────────────────────────────
// The parent div has data-active-tab="summary|notes|transcript".
// Each child tab node renders a div with data-tab="summary|notes|transcript".
// Only the active tab's content is visible and editable.

const TAB_VISIBILITY_STYLE_ID = 'meeting-minutes-tab-styles';

function injectTabStyles() {
    if (typeof document === 'undefined') return;
    if (document.getElementById(TAB_VISIBILITY_STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = TAB_VISIBILITY_STYLE_ID;
    style.textContent = `
.meeting-tabs-container [data-tab] { display: none; }
.meeting-tabs-container[data-active-tab="summary"] [data-tab="summary"],
.meeting-tabs-container[data-active-tab="notes"] [data-tab="notes"],
.meeting-tabs-container[data-active-tab="transcript"] [data-tab="transcript"] { display: block; }
`;
    document.head.appendChild(style);
}

// Inject on module load
injectTabStyles();

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
    if (!timestamp) return 'Today';
    const date = new Date(timestamp);
    const now = new Date();
    if (date.toDateString() === now.toDateString()) return 'Today';
    return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
};

// ─── Calendar Day Icon ──────────────────────────────────

const CalendarDayIcon: React.FC = () => {
    const day = new Date().getDate();
    return (
        <div className="w-6 h-6 rounded-md bg-muted flex items-center justify-center shrink-0 relative overflow-hidden">
            <Calendar className="h-4 w-4 text-muted-foreground absolute" />
            <span className="text-[8px] font-bold text-foreground relative z-10 mt-1.5">{day}</span>
        </div>
    );
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

/**
 * Find the position + size of a specific child tab node inside the meetingMinutes node.
 * Returns { pos, node } or null.
 */
const findTabChild = (
    doc: { nodeAt: (pos: number) => PMNode | null },
    parentPos: number,
    tabType: string
): { pos: number; node: PMNode } | null => {
    const parent = doc.nodeAt(parentPos);
    if (!parent) return null;
    let offset = parentPos + 1; // start after the parent's opening tag
    for (let i = 0; i < parent.childCount; i++) {
        const child = parent.child(i);
        if (child.type.name === tabType) {
            return { pos: offset, node: child };
        }
        offset += child.nodeSize;
    }
    return null;
};

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
    const [activeTab, setActiveTab] = useState<MeetingTab>((node.attrs.activeTab as MeetingTab) || 'notes');
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

    // ─── Tab switching (CSS-based, no content swapping) ────

    const handleTabSwitch = useCallback((newTab: MeetingTab) => {
        if (newTab === activeTab) return;
        setActiveTab(newTab);
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

            // Insert transcript text into the meetingTabTranscript child node
            const pos = getPos();
            if (typeof pos === 'number' && t) {
                const tabInfo = findTabChild(editor.state.doc, pos, 'meetingTabTranscript');
                if (tabInfo) {
                    editor.chain()
                        .deleteRange({ from: tabInfo.pos + 1, to: tabInfo.pos + tabInfo.node.nodeSize - 1 })
                        .insertContentAt(tabInfo.pos + 1, t, {
                            applyInputRules: false,
                            applyPasteRules: false,
                            parseOptions: { preserveWhitespace: true }
                        })
                        .run();
                }
            }

            setActiveTab('transcript');
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

            // Clear existing summary content and insert placeholder
            const pos = getPos();
            if (typeof pos === 'number') {
                const tabInfo = findTabChild(editor.state.doc, pos, 'meetingTabSummary');
                if (tabInfo) {
                    editor.chain().focus()
                        .deleteRange({ from: tabInfo.pos + 1, to: tabInfo.pos + tabInfo.node.nodeSize - 1 })
                        .insertContentAt(tabInfo.pos + 1, { type: 'paragraph' })
                        .run();
                }
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

            // Insert generated summary into the meetingTabSummary child node
            if (typeof pos === 'number' && summaryText) {
                const tabInfo = findTabChild(editor.state.doc, pos, 'meetingTabSummary');
                if (tabInfo) {
                    editor.chain().focus()
                        .deleteRange({ from: tabInfo.pos + 1, to: tabInfo.pos + tabInfo.node.nodeSize - 1 })
                        .insertContentAt(tabInfo.pos + 1, summaryText, {
                            applyInputRules: false,
                            applyPasteRules: false,
                            parseOptions: { preserveWhitespace: false }
                        })
                        .run();
                }
            }
        } finally {
            setIsGeneratingSummary(false);
        }
    }, [transcript, editor, getPos]);

    // ─── Insert Transcript ──────────────────────────────

    const handleInsertTranscript = useCallback(() => {
        if (!transcript) return;
        // Insert transcript raw text into the transcript tab child node
        const pos = getPos();
        if (typeof pos === 'number') {
            const tabInfo = findTabChild(editor.state.doc, pos, 'meetingTabTranscript');
            if (tabInfo) {
                editor.chain().focus()
                    .deleteRange({ from: tabInfo.pos + 1, to: tabInfo.pos + tabInfo.node.nodeSize - 1 })
                    .insertContentAt(tabInfo.pos + 1, transcript, {
                        applyInputRules: false,
                        applyPasteRules: false,
                        parseOptions: { preserveWhitespace: true }
                    })
                    .run();
            }
        }
    }, [transcript, editor, getPos]);

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
        setActiveTab('notes');
        updateAttributes({
            isRecording: false, isPaused: false, duration: 0,
            audioPath: null, audioUrl: null, transcript: ''
        });
        // Reset all three child tab nodes to empty paragraphs
        const pos = getPos();
        if (typeof pos === 'number') {
            const tabTypes = ['meetingTabSummary', 'meetingTabNotes', 'meetingTabTranscript'];
            // Process in reverse order so position offsets remain valid
            for (let i = tabTypes.length - 1; i >= 0; i--) {
                const tabInfo = findTabChild(editor.state.doc, pos, tabTypes[i]);
                if (tabInfo) {
                    editor.chain()
                        .deleteRange({ from: tabInfo.pos + 1, to: tabInfo.pos + tabInfo.node.nodeSize - 1 })
                        .insertContentAt(tabInfo.pos + 1, { type: 'paragraph' })
                        .run();
                }
            }
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

    const meetingTitle = node.attrs.title || 'Meeting';

    // ─── Consent state ──────────────────────────────────────
    const [consentMode, setConsentMode] = useState<'myself' | 'audio'>('myself');
    const [showConsentCard, setShowConsentCard] = useState(true);

    // ─── Tab definitions ────────────────────────────────

    const tabs: { key: MeetingTab; label: string; icon: React.ReactNode }[] = [
        { key: 'summary', label: 'Summary', icon: <Sparkles className="h-3.5 w-3.5" /> },
        { key: 'notes', label: 'Notes', icon: <PenLine className="h-3.5 w-3.5" /> },
        { key: 'transcript', label: 'Transcript', icon: <ListTree className="h-3.5 w-3.5" /> },
    ];

    // ─── Render: Idle (Notion-style) ────────────────────

    if (state === 'idle') {
        return (
            <NodeViewWrapper as="div" className="my-4 not-prose">
                <div className="w-full rounded-lg border border-border bg-card overflow-hidden">
                    {/* ── Title Bar ── */}
                    <div className="px-5 pt-4 pb-2 flex items-center gap-1.5 border-b border-border">
                        <CalendarDayIcon />
                        <ChevronDown className="h-3 w-3 text-muted-foreground/60 shrink-0" />
                        {isEditingTitle ? (
                            <input
                                ref={titleInputRef}
                                value={node.attrs.title || ''}
                                onChange={handleTitleChange}
                                onBlur={handleTitleBlur}
                                onKeyDown={handleTitleKeyDown}
                                className="text-base font-semibold text-foreground bg-transparent outline-none border-none flex-1 min-w-0"
                                placeholder="Meeting title…"
                            />
                        ) : (
                            <h3
                                className="text-base font-semibold text-foreground truncate cursor-text flex-1 min-w-0"
                                onClick={handleTitleClick}
                            >
                                {meetingTitle}
                            </h3>
                        )}
                        <span className="text-sm text-blue-500 shrink-0 ml-1 select-none">
                            @{formatDate(node.attrs.createdAt)}
                        </span>
                    </div>

                    {/* ── Navigation Bar ── */}
                    <div className="px-5 py-2 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            {/* Notes pill button */}
                            <button
                                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-muted text-sm text-foreground hover:bg-muted/80 transition-colors"
                            >
                                <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                                Notes
                            </button>
                        </div>
                        <div className="flex items-center gap-1.5">
                            {/* Tip icon */}
                            <button className="h-7 w-7 rounded-md hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors" title="Tips">
                                <Lightbulb className="h-4 w-4" />
                            </button>
                            {/* Settings icon */}
                            <button className="h-7 w-7 rounded-md hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors" title="Settings">
                                <Settings className="h-4 w-4" />
                            </button>
                            {/* Start transcribing button */}
                            <Button
                                onClick={handleStart}
                                size="sm"
                                className="gap-1.5 bg-blue-500 hover:bg-blue-600 text-white rounded-md px-3 h-7 text-xs"
                            >
                                Start transcribing
                                <ChevronDown className="h-3 w-3" />
                            </Button>
                        </div>
                    </div>

                    {/* ── Notes Editor (only meetingTabNotes visible) ── */}
                    <div data-active-tab="notes" className="meeting-tabs-container">
                        <NodeViewContent className="prose prose-sm dark:prose-invert max-w-none focus:outline-none prose-p:my-1 prose-p:text-sm prose-p:text-muted-foreground prose-headings:mt-3 prose-headings:mb-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5" />
                    </div>

                    {/* ── How it works ── */}
                    <div className="px-5 pt-3 pb-3 border-t border-border/50">
                        <p className="text-sm text-muted-foreground font-medium mb-2">How it works:</p>
                        <ol className="text-sm text-muted-foreground space-y-1.5 list-decimal list-inside">
                            <li>Click "Start transcribing" to get started.</li>
                            <li>Add notes here anytime. AI uses them to make the summary smarter.</li>
                            <li>When you're done, click "Stop". AI will generate a summary with action items.</li>
                        </ol>
                    </div>

                    {/* ── Notification Consent Card ── */}
                    {showConsentCard && (
                        <div className="mx-5 mb-3 p-4 rounded-lg bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-500/20">
                            <p className="text-sm font-semibold text-blue-600 dark:text-blue-400 mb-1.5">Choose how you notify others</p>
                            <p className="text-xs text-blue-700/70 dark:text-blue-300/80 mb-3 leading-relaxed">
                                To let others know you're transcribing, Notion can play an audio message or you can continue to get consent yourself. Set your default for all meetings:
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
                                    Get consent myself
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
                                    Automatically play audio
                                </button>
                            </div>
                        </div>
                    )}

                    {/* ── Footer ── */}
                    <div className="px-5 py-2 border-t border-border flex items-center text-xs text-muted-foreground select-none gap-2">
                        <span>Instructions:</span>
                        <button className="inline-flex items-center gap-0.5 font-semibold text-foreground hover:text-foreground/80 transition-colors">
                            Auto
                            <ChevronDown className="h-3 w-3" />
                        </button>
                        <div className="w-px h-3 bg-border mx-1" />
                        <span className="flex-1 truncate">By starting, you confirm everyone being transcribed has given consent.</span>
                        <div className="flex items-center gap-1 shrink-0">
                            <button className="h-5 w-5 rounded hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors" title="Volume">
                                <Volume2 className="h-3 w-3" />
                            </button>
                            <button className="h-5 w-5 rounded hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors" title="Copy">
                                <Copy className="h-3 w-3" />
                            </button>
                        </div>
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
                    {/* ── Title Bar ── */}
                    <div className="px-5 pt-4 pb-2 flex items-center gap-1.5">
                        <CalendarDayIcon />
                        <ChevronDown className="h-3 w-3 text-muted-foreground/60 shrink-0" />
                        <span className="text-base font-semibold text-foreground">{meetingTitle}</span>
                        <span className="text-sm text-blue-500 shrink-0 ml-1 select-none">
                            @{formatDate(node.attrs.createdAt)}
                        </span>
                    </div>

                    {/* ── Recording Nav Bar ── */}
                    <div className="px-5 py-2 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className={cn(
                                "w-2 h-2 rounded-full",
                                state === 'recording' ? "bg-red-500 animate-pulse" : "bg-yellow-500"
                            )} />
                            <span className="text-sm text-muted-foreground">
                                {state === 'recording' ? 'Transcribing' : 'Paused'}
                            </span>
                            <span className="text-xl font-mono font-semibold tabular-nums text-foreground">
                                {formatDuration(duration)}
                            </span>
                        </div>
                        <div className="flex items-center gap-2">
                            {state === 'recording' ? (
                                <button onClick={handlePause} className="h-7 px-3 rounded-md bg-muted hover:bg-muted/80 text-sm text-foreground flex items-center gap-1.5 transition-colors">
                                    <Pause className="h-3.5 w-3.5" />
                                    Pause
                                </button>
                            ) : (
                                <button onClick={handleResume} className="h-7 px-3 rounded-md bg-muted hover:bg-muted/80 text-sm text-foreground flex items-center gap-1.5 transition-colors">
                                    <Play className="h-3.5 w-3.5" />
                                    Resume
                                </button>
                            )}
                            <button onClick={handleStop} className="h-7 px-3 rounded-md bg-red-500 hover:bg-red-600 text-sm text-white flex items-center gap-1.5 transition-colors">
                                <Square className="h-3.5 w-3.5" />
                                Stop
                            </button>
                        </div>
                    </div>

                    {/* ── Notes Editor (only meetingTabNotes visible) ── */}
                    <div data-active-tab="notes" className="meeting-tabs-container px-5 pt-3 pb-2 min-h-[48px]">
                        <NodeViewContent className="prose prose-sm dark:prose-invert max-w-none focus:outline-none prose-p:my-1 prose-p:text-sm prose-headings:mt-3 prose-headings:mb-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5" />
                    </div>

                    {/* ── Live Transcript (editable) ── */}
                    <div className="px-5 pb-5">
                        <div className="border-t border-border/50 pt-3">
                            <div className="flex items-center justify-between mb-1.5">
                                <span className="text-xs text-muted-foreground font-medium">Live transcript</span>
                                <span className="text-[10px] text-muted-foreground">Editable</span>
                            </div>
                            {transcript ? (
                                <textarea
                                    value={transcript}
                                    onChange={(e) => setTranscript(e.target.value)}
                                    className="w-full text-sm leading-relaxed bg-muted/40 rounded-md p-3 max-h-28 overflow-y-auto resize-none focus:outline-none focus:ring-1 focus:ring-blue-500/40 text-foreground/90 placeholder:text-muted-foreground"
                                    placeholder="Transcript will appear here…"
                                    rows={3}
                                />
                            ) : (
                                <p className="text-sm text-muted-foreground text-center py-3">Listening…</p>
                            )}
                        </div>
                    </div>

                    {/* ── Footer ── */}
                    <div className="px-5 py-2 border-t border-border flex items-center text-xs text-muted-foreground select-none gap-2">
                        <span>Instructions:</span>
                        <button className="inline-flex items-center gap-0.5 font-semibold text-foreground hover:text-foreground/80 transition-colors">
                            Auto
                            <ChevronDown className="h-3 w-3" />
                        </button>
                        <div className="w-px h-3 bg-border mx-1" />
                        <span className="flex-1 truncate">By starting, you confirm everyone being transcribed has given consent.</span>
                        <div className="flex items-center gap-1 shrink-0">
                            <button className="h-5 w-5 rounded hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors" title="Volume">
                                <Volume2 className="h-3 w-3" />
                            </button>
                            <button className="h-5 w-5 rounded hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors" title="Copy">
                                <Copy className="h-3 w-3" />
                            </button>
                        </div>
                    </div>
                </div>
            </NodeViewWrapper>
        );
    }

    // ─── Render: Processing ─────────────────────────────

    if (state === 'processing') {
        return (
            <NodeViewWrapper as="div" className="my-4 not-prose">
                <div className="w-full rounded-lg border border-border bg-card overflow-hidden">
                    {/* ── Title Bar ── */}
                    <div className="px-5 pt-4 pb-2 flex items-center gap-1.5">
                        <CalendarDayIcon />
                        <ChevronDown className="h-3 w-3 text-muted-foreground/60 shrink-0" />
                        <span className="text-base font-semibold text-foreground">{meetingTitle}</span>
                        <span className="text-sm text-blue-500 shrink-0 ml-1 select-none">
                            @{formatDate(node.attrs.createdAt)}
                        </span>
                    </div>
                    <div className="flex flex-col items-center justify-center py-10 gap-3">
                        <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
                        <p className="text-sm text-muted-foreground">Processing…</p>
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
                <div className="px-5 pt-4 pb-2 flex items-center gap-1.5">
                    <CalendarDayIcon />
                    <ChevronDown className="h-3 w-3 text-muted-foreground/60 shrink-0" />

                    {isEditingTitle ? (
                        <input
                            ref={titleInputRef}
                            value={node.attrs.title || ''}
                            onChange={handleTitleChange}
                            onBlur={handleTitleBlur}
                            onKeyDown={handleTitleKeyDown}
                            className="text-base font-semibold text-foreground bg-transparent outline-none border-none flex-1 min-w-0"
                            placeholder="Meeting title…"
                        />
                    ) : (
                        <h3
                            className="text-base font-semibold text-foreground truncate cursor-text flex-1 min-w-0"
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
                <div className="px-5 flex items-center justify-between border-b border-border/50">
                    <div className="flex items-center gap-0">
                        {tabs.map((tab) => (
                            <button
                                key={tab.key}
                                onClick={() => handleTabSwitch(tab.key)}
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
                        <button onClick={handleReset} className="h-7 w-7 rounded-md hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors" title="New recording">
                            <RotateCcw className="h-3.5 w-3.5" />
                        </button>
                        {localAudioUrl && (
                            <button onClick={handleSaveToFile} className="h-7 w-7 rounded-md hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors" title="Save recording">
                                <Save className="h-3.5 w-3.5" />
                            </button>
                        )}
                        <Button size="sm" onClick={handleShareSummary} className="ml-1.5 h-7 text-xs gap-1 bg-blue-500 hover:bg-blue-600 text-white rounded-md px-3">
                            <Share2 className="h-3 w-3" />
                            Share
                        </Button>
                    </div>
                </div>

                {/* ── Tab Content ── */}
                <div className="min-h-[100px]">
                    {/* Audio player (shown in all tabs) */}
                    {localAudioUrl && (
                        <div className="mx-5 mt-4 p-2.5 bg-muted/30 rounded-md">
                            <AudioPlayer audioUrl={localAudioUrl} />
                        </div>
                    )}

                    {/* Summary tab header: Generate AI summary button */}
                    {activeTab === 'summary' && !isGeneratingSummary && transcript && (
                        <div className="mx-5 mt-3">
                            <Button variant="outline" size="sm" onClick={handleGenerateSummary} className="gap-1.5 text-xs h-7">
                                <Sparkles className="h-3.5 w-3.5 text-blue-500" />
                                Generate AI summary
                            </Button>
                        </div>
                    )}

                    {/* Generating indicator */}
                    {activeTab === 'summary' && isGeneratingSummary && (
                        <div className="mx-5 mt-3 flex items-center gap-2">
                            <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-500" />
                            <span className="text-xs text-muted-foreground">Generating summary…</span>
                        </div>
                    )}

                    {/* Transcript tab header: char count + insert button */}
                    {activeTab === 'transcript' && (
                        <div className="mx-5 mt-3 flex items-center justify-between">
                            <span className="text-xs font-medium text-muted-foreground">Transcript</span>
                            <div className="flex items-center gap-2">
                                {transcript && (
                                    <span className="text-xs text-muted-foreground">{transcript.length} chars</span>
                                )}
                                <Button
                                    variant="ghost" size="sm"
                                    onClick={handleInsertTranscript}
                                    className="h-6 text-xs gap-1 px-2"
                                >
                                    <PenLine className="h-3 w-3" />
                                    Insert to editor
                                </Button>
                            </div>
                        </div>
                    )}

                    {/* Editor: NodeViewContent renders all 3 tab child nodes.
                        CSS toggles visibility based on data-active-tab. */}
                    <div data-active-tab={activeTab} className="meeting-tabs-container px-5 py-3">
                        <NodeViewContent className="min-h-[60px] prose prose-sm dark:prose-invert max-w-none focus:outline-none prose-p:my-1.5 prose-headings:mt-4 prose-headings:mb-2 prose-ul:my-1.5 prose-ol:my-1.5 prose-li:my-0.5" />
                    </div>
                </div>

                {/* ── Footer ── */}
                <div className="px-5 py-2 border-t border-border flex items-center text-xs text-muted-foreground select-none gap-2">
                    <span>Duration:&nbsp;</span>
                    <span className="font-medium text-foreground tabular-nums">{formatDuration(duration)}</span>
                    <div className="w-px h-3 bg-border mx-2" />
                    <span>Was this summary helpful?</span>
                    <button
                        onClick={() => setFeedbackGiven(feedbackGiven === 'up' ? null : 'up')}
                        className={cn("ml-1 h-5 w-5 rounded flex items-center justify-center transition-colors",
                            feedbackGiven === 'up' ? "text-blue-500 bg-blue-500/10" : "hover:bg-muted hover:text-foreground"
                        )}
                    >
                        <ThumbsUp className="h-3 w-3" />
                    </button>
                    <button
                        onClick={() => setFeedbackGiven(feedbackGiven === 'down' ? null : 'down')}
                        className={cn("h-5 w-5 rounded flex items-center justify-center transition-colors",
                            feedbackGiven === 'down' ? "text-orange-500 bg-orange-500/10" : "hover:bg-muted hover:text-foreground"
                        )}
                    >
                        <ThumbsDown className="h-3 w-3" />
                    </button>
                </div>
            </div>
        </NodeViewWrapper>
    );
};
