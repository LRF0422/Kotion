import { NodeViewProps, NodeViewWrapper, NodeViewContent, Editor, Node as PMNode } from "@kn/editor";
import React, { useState, useEffect, useRef, useCallback } from "react";
import { useMeetingRecorder } from "../../hooks/useMeetingRecorder";
import { useFileService, streamKnowledgeText, useTranslation } from "@kn/common";
import { Popover, PopoverContent, PopoverTrigger, Calendar, cn, toast, format } from "@kn/ui";
import {
    Mic, Pause, Play, Square, Sparkles,
    Loader2, RotateCcw, Share2,
    PenLine, ListTree, ChevronDown,
    Lightbulb, Languages, Check,
} from "@kn/icon";
import { AttendeePicker, Attendee } from "./AttendeePicker";

// ─── Tab Visibility CSS ───────────────────────────────
// The container div has data-active-tab="notes|transcript".
// Each child tab node renders a div with data-tab="notes|transcript".
// Only the active tab's content is visible and editable.

const TAB_VISIBILITY_STYLE_ID = 'meeting-minutes-tab-styles';

function injectTabStyles() {
    if (typeof document === 'undefined') return;
    if (document.getElementById(TAB_VISIBILITY_STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = TAB_VISIBILITY_STYLE_ID;
    style.textContent = `
.meeting-tabs-container [data-tab] { display: none; }
.meeting-tabs-container[data-active-tab="notes"] [data-tab="notes"],
.meeting-tabs-container[data-active-tab="transcript"] [data-tab="transcript"] { display: block; }
.meeting-notes-placeholder p.is-empty:first-child::before {
  content: attr(data-placeholder);
  float: left;
  height: 0;
  pointer-events: none;
  color: hsl(var(--muted-foreground));
  opacity: 0.6;
}
`;
    document.head.appendChild(style);
}

injectTabStyles();

// ─── Helpers ────────────────────────────────────────────

const formatDuration = (seconds: number): string => {
    if (!Number.isFinite(seconds) || seconds < 0) return '00:00';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hrs > 0) {
        return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

// ─── Date Picker Button ────────────────────────────────

interface DatePickerButtonProps {
    value: Date;
    onChange: (date: Date) => void;
}

const DatePickerButton: React.FC<DatePickerButtonProps> = ({ value, onChange }) => {
    const dateStr = format(value, 'MMM d, yyyy');
    return (
        <Popover>
            <PopoverTrigger asChild>
                <button className="h-6 px-2 rounded-md bg-muted hover:bg-muted/80 flex items-center justify-center shrink-0 transition-colors cursor-pointer text-xs font-medium text-foreground">
                    {dateStr}
                </button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                    mode="single"
                    selected={value}
                    onSelect={(d) => { if (d) onChange(d); }}
                    initialFocus
                />
            </PopoverContent>
        </Popover>
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
        const onMeta = () => {
            const d = audio.duration;
            setDur(Number.isFinite(d) ? d : 0);
        };
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
                type="range" min={0} max={Number.isFinite(dur) ? dur : 0} value={currentTime} onChange={handleSeek}
                className="flex-1 h-1 bg-muted rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:h-2.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-blue-500"
            />
            <span className="text-[11px] text-muted-foreground tabular-nums shrink-0">{formatDuration(Math.floor(dur))}</span>
        </div>
    );
};

// ─── Recording dots indicator (Notion-style waveform) ───

const DotsIndicator: React.FC<{ active: boolean }> = ({ active }) => (
    <div className="flex-1 flex items-center gap-1 overflow-hidden px-2">
        {Array.from({ length: 40 }).map((_, i) => (
            <span
                key={i}
                className={cn(
                    "w-0.5 h-0.5 rounded-full shrink-0",
                    active ? "bg-blue-500/60 animate-pulse" : "bg-muted-foreground/30"
                )}
                style={active ? { animationDelay: `${(i % 8) * 80}ms` } : undefined}
            />
        ))}
    </div>
);

// ─── Types ──────────────────────────────────────────────

type RecordingState = 'idle' | 'recording' | 'paused' | 'processing' | 'completed';
type MeetingTab = 'notes' | 'transcript';

const LANG_OPTIONS = [
    { value: 'zh-CN', label: '中文' },
    { value: 'en-US', label: 'English' },
    { value: 'ja-JP', label: '日本語' },
];

/**
 * Find the position + size of a specific child tab node inside the meetingMinutes node.
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
    const { t } = useTranslation();
    const m = useCallback((key: string) => t(`meetingMinutes.${key}`), [t]);

    const lang = node.attrs.lang || 'zh-CN';

    const [transcript, setTranscript] = useState(node.attrs.transcript || '');

    const {
        isRecording, isPaused, duration, speechSupported,
        startRecording, pauseRecording, resumeRecording, stopRecording,
    } = useMeetingRecorder({ lang, onTranscriptionUpdate: setTranscript });

    const fileService = useFileService();


    const hasCompletedData = !!(node.attrs.transcript || node.attrs.audioPath || node.attrs.audioUrl);
    const [state, setState] = useState<RecordingState>(() => (hasCompletedData ? 'completed' : 'idle'));
    const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
    const [localAudioUrl, setLocalAudioUrl] = useState<string | null>(node.attrs.audioUrl || null);
    const [activeTab, setActiveTab] = useState<MeetingTab>(
        (node.attrs.activeTab === 'transcript' ? 'transcript' : 'notes')
    );
    const [isEditingTitle, setIsEditingTitle] = useState(false);
    const [meetingDate, setMeetingDate] = useState<Date>(() =>
        node.attrs.createdAt ? new Date(node.attrs.createdAt) : new Date()
    );
    const titleInputRef = useRef<HTMLInputElement>(null);

    const isEditable = editor.isEditable;
    const isBusy = state === 'recording' || state === 'paused' || state === 'processing';

    // Reset stale isRecording flag from a previous session
    useEffect(() => {
        if (node.attrs.isRecording) {
            updateAttributes({ isRecording: false, isPaused: false });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Recording state sync
    useEffect(() => {
        if (isRecording) setState('recording');
        else if (isPaused) setState('paused');
    }, [isRecording, isPaused]);

    // Persist transcript to node attribute (skip during active recording churn)
    useEffect(() => {
        if (!isRecording && transcript !== node.attrs.transcript) {
            updateAttributes({ transcript, updatedAt: Date.now() });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [transcript, isRecording]);

    // Sync active tab
    useEffect(() => {
        if (activeTab !== node.attrs.activeTab) {
            updateAttributes({ activeTab });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTab]);

    // ─── Recording Handlers ─────────────────────────────

    const handleStart = async () => {
        setState('recording');
        setTranscript('');
        setLocalAudioUrl(null);
        setActiveTab('transcript');
        updateAttributes({ isRecording: true, isPaused: false, duration: 0 });
        await startRecording();
    };

    const handlePause = () => {
        pauseRecording();
        setState('paused');
        updateAttributes({ isPaused: true });
    };

    const handleResume = () => {
        resumeRecording();
        setState('recording');
        updateAttributes({ isPaused: false });
    };

    const handleStop = async () => {
        updateAttributes({ isRecording: false, isPaused: false, duration });
        setState('processing');
        const result = await stopRecording();
        if (result) {
            const tText = result.transcript || '';
            setTranscript(tText);
            setLocalAudioUrl(result.audioBlob ? URL.createObjectURL(result.audioBlob) : null);

            // Auto-upload recording via fileService
            if (result.audioBlob) {
                try {
                    const fileName = `${m('recordingFilePrefix')}_${new Date().toLocaleDateString('zh-CN').replace(/\//g, '-')}_${new Date().toLocaleTimeString('zh-CN', { hour12: false }).replace(/:/g, '-')}.webm`;
                    const file = new File([result.audioBlob], fileName, { type: 'audio/webm' });
                    const uploadResult = await fileService.uploadFile(file);
                    const remoteAudioUrl = uploadResult.name ? fileService.getDownloadUrl(uploadResult.name) : null;
                    updateAttributes({
                        audioPath: uploadResult.path || uploadResult.name,
                        audioUrl: remoteAudioUrl,
                    });
                    toast.success(m('audioSaved'));
                } catch (err) {
                    console.error('Error uploading recording:', err);
                    toast.error(m('uploadRecordingFailed'));
                }
            }

            // Insert transcript text into the transcript child node
            const pos = getPos();
            if (typeof pos === 'number' && tText) {
                const tabInfo = findTabChild(editor.state.doc, pos, 'meetingTabTranscript');
                if (tabInfo) {
                    editor.chain()
                        .deleteRange({ from: tabInfo.pos + 1, to: tabInfo.pos + tabInfo.node.nodeSize - 1 })
                        .insertContentAt(tabInfo.pos + 1, tText, {
                            applyInputRules: false,
                            applyPasteRules: false,
                            parseOptions: { preserveWhitespace: true }
                        })
                        .run();
                }
            }

            setState('completed');
        } else {
            setState('idle');
        }
    };

    // ─── AI Summary → writes into the Notes tab ─────────

    const handleGenerateSummary = useCallback(async () => {
        if (!transcript) return;
        setIsGeneratingSummary(true);
        setActiveTab('notes');

        try {
            const prompt = m('summaryPrompt').replace('{{transcript}}', transcript);

            let summaryText = '';
            try {
                const { textStream } = streamKnowledgeText(prompt);
                for await (const part of textStream) {
                    summaryText += part;
                }
            } catch (err) {
                console.error('Error generating summary:', err);
                summaryText = `**[${m('summaryGenerationFailed')}]**\n\n${transcript.slice(0, 500)}${transcript.length > 500 ? '...' : ''}`;
            }

            // Re-resolve position AFTER the await, then insert into the Notes child.
            const pos = getPos();
            if (typeof pos === 'number' && summaryText) {
                const tabInfo = findTabChild(editor.state.doc, pos, 'meetingTabNotes');
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
    }, [transcript, editor, getPos, m]);

    // ─── Reset ──────────────────────────────────────────

    const handleReset = () => {
        setState('idle');
        setTranscript('');
        setLocalAudioUrl(null);
        setActiveTab('notes');
        updateAttributes({
            isRecording: false, isPaused: false, duration: 0,
            audioPath: null, audioUrl: null, transcript: '',
            activeTab: 'notes'
        });
        const pos = getPos();
        if (typeof pos === 'number') {
            const tabTypes = ['meetingTabNotes', 'meetingTabTranscript'];
            // Reverse order so position offsets remain valid
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

    // ─── Metadata handlers ──────────────────────────────

    const handleTitleClick = useCallback(() => {
        if (!isEditable) return;
        setIsEditingTitle(true);
        setTimeout(() => titleInputRef.current?.focus(), 0);
    }, [isEditable]);

    const handleTitleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        updateAttributes({ title: e.target.value, updatedAt: Date.now() });
    }, [updateAttributes]);

    const handleTitleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Enter') setIsEditingTitle(false);
    }, []);

    const handleDateChange = useCallback((date: Date) => {
        setMeetingDate(date);
        updateAttributes({ createdAt: date.getTime(), updatedAt: Date.now() });
    }, [updateAttributes]);

    const handleAttendeesChange = useCallback((attendees: Attendee[]) => {
        updateAttributes({ attendees, updatedAt: Date.now() });
    }, [updateAttributes]);

    const handleLangChange = useCallback((value: string) => {
        updateAttributes({ lang: value });
    }, [updateAttributes]);

    const handleShare = useCallback(() => {
        const title = node.attrs.title || m('title');
        const content = `# ${title}\n\n${transcript ? `## ${m('transcript')}\n${transcript}` : ''}`;
        navigator.clipboard.writeText(content)
            .then(() => toast.success(m('copiedToClipboard')))
            .catch(() => toast.error(m('copyFailed')));
    }, [transcript, node.attrs.title, m]);

    const dateLabel = format(meetingDate, 'MMM d, yyyy');
    const meetingTitle = node.attrs.title || m('meetingTitle');
    const attendees: Attendee[] = Array.isArray(node.attrs.attendees) ? node.attrs.attendees : [];

    const tabs: { key: MeetingTab; label: string; icon: React.ReactNode }[] = [
        { key: 'notes', label: m('notes'), icon: <PenLine className="h-3.5 w-3.5" /> },
        { key: 'transcript', label: m('transcript'), icon: <ListTree className="h-3.5 w-3.5" /> },
    ];

    return (
        <NodeViewWrapper as="div" className="my-4 not-prose">
            <div className="w-full rounded-lg border border-border bg-card overflow-hidden shadow-sm">

                {/* ── Header: date · title ── */}
                <div contentEditable={false} suppressContentEditableWarning className="px-5 pt-4 pb-1.5 flex items-center gap-1.5">
                    <DatePickerButton value={meetingDate} onChange={handleDateChange} />
                    <ChevronDown className="h-3 w-3 text-muted-foreground/60 shrink-0" />
                    {isEditingTitle ? (
                        <input
                            ref={titleInputRef}
                            value={node.attrs.title || ''}
                            onChange={handleTitleChange}
                            onBlur={() => setIsEditingTitle(false)}
                            onKeyDown={handleTitleKeyDown}
                            className="text-base font-semibold text-foreground bg-transparent outline-none border-none flex-1 min-w-0"
                            placeholder={m('meetingTitlePlaceholder')}
                        />
                    ) : (
                        <h3
                            className="text-base font-semibold text-foreground truncate cursor-text flex-1 min-w-0"
                            onClick={handleTitleClick}
                        >
                            {meetingTitle} <span className="text-muted-foreground font-normal">@{dateLabel}</span>
                        </h3>
                    )}
                </div>

                {/* ── Attendees property row ── */}
                <div contentEditable={false} suppressContentEditableWarning className="px-5 pb-2.5">
                    <AttendeePicker
                        value={attendees}
                        onChange={handleAttendeesChange}
                        disabled={!isEditable}
                    />
                </div>

                {/* ── Toolbar: tabs · recording controls ── */}
                <div contentEditable={false} suppressContentEditableWarning className="px-3 py-1.5 flex items-center gap-1 border-y border-border/60 bg-muted/20">
                    {/* Tabs */}
                    {tabs.map((tab) => (
                        <button
                            key={tab.key}
                            onClick={() => setActiveTab(tab.key)}
                            className={cn(
                                "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-sm font-medium transition-colors select-none",
                                activeTab === tab.key
                                    ? "bg-background text-foreground shadow-sm"
                                    : "text-muted-foreground hover:text-foreground"
                            )}
                        >
                            {tab.icon}
                            {tab.label}
                        </button>
                    ))}

                    {/* Center: recording dots / duration */}
                    {isBusy ? (
                        <div className="flex-1 flex items-center gap-2 px-2 min-w-0">
                            <span className={cn(
                                "w-2 h-2 rounded-full shrink-0",
                                state === 'recording' ? "bg-red-500 animate-pulse" : state === 'paused' ? "bg-yellow-500" : "bg-blue-500"
                            )} />
                            <span className="text-xs font-mono tabular-nums text-foreground shrink-0">{formatDuration(duration)}</span>
                            <DotsIndicator active={state === 'recording'} />
                        </div>
                    ) : (
                        <DotsIndicator active={false} />
                    )}

                    {/* Right cluster */}
                    {isEditable && (
                        <div className="flex items-center gap-0.5 shrink-0">
                            {/* AI summary */}
                            {!isBusy && transcript && (
                                <button
                                    onClick={handleGenerateSummary}
                                    disabled={isGeneratingSummary}
                                    className="h-7 px-2 rounded-md hover:bg-muted flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                                    title={m('generateAISummary')}
                                >
                                    {isGeneratingSummary
                                        ? <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-500" />
                                        : <Sparkles className="h-3.5 w-3.5 text-blue-500" />}
                                    <span className="hidden sm:inline">{m('summary')}</span>
                                </button>
                            )}

                            {/* Language settings */}
                            <Popover>
                                <PopoverTrigger asChild>
                                    <button className="h-7 w-7 rounded-md hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors" title={m('language')}>
                                        <Languages className="h-4 w-4" />
                                    </button>
                                </PopoverTrigger>
                                <PopoverContent className="w-40 p-1" align="end">
                                    <p className="px-2 py-1 text-xs text-muted-foreground">{m('language')}</p>
                                    {LANG_OPTIONS.map((opt) => (
                                        <button
                                            key={opt.value}
                                            onClick={() => handleLangChange(opt.value)}
                                            className="w-full flex items-center justify-between px-2 py-1.5 rounded text-sm hover:bg-muted transition-colors"
                                        >
                                            {opt.label}
                                            {lang === opt.value && <Check className="h-3.5 w-3.5 text-blue-500" />}
                                        </button>
                                    ))}
                                </PopoverContent>
                            </Popover>

                            {/* Recording controls */}
                            {state === 'processing' ? (
                                <div className="h-7 px-2 flex items-center gap-1 text-xs text-muted-foreground">
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    {m('processing')}
                                </div>
                            ) : state === 'recording' ? (
                                <>
                                    <button onClick={handlePause} className="h-7 px-2.5 rounded-md bg-muted hover:bg-muted/80 text-xs text-foreground flex items-center gap-1 transition-colors">
                                        <Pause className="h-3.5 w-3.5" />{m('pause')}
                                    </button>
                                    <button onClick={handleStop} className="h-7 px-2.5 rounded-md bg-red-500 hover:bg-red-600 text-xs text-white flex items-center gap-1 transition-colors">
                                        <Square className="h-3 w-3" />{m('stop')}
                                    </button>
                                </>
                            ) : state === 'paused' ? (
                                <>
                                    <button onClick={handleResume} className="h-7 px-2.5 rounded-md bg-muted hover:bg-muted/80 text-xs text-foreground flex items-center gap-1 transition-colors">
                                        <Play className="h-3.5 w-3.5" />{m('resume')}
                                    </button>
                                    <button onClick={handleStop} className="h-7 px-2.5 rounded-md bg-red-500 hover:bg-red-600 text-xs text-white flex items-center gap-1 transition-colors">
                                        <Square className="h-3 w-3" />{m('stop')}
                                    </button>
                                </>
                            ) : state === 'completed' ? (
                                <>
                                    <button onClick={handleReset} className="h-7 w-7 rounded-md hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors" title={m('newRecording')}>
                                        <RotateCcw className="h-3.5 w-3.5" />
                                    </button>
                                    <button onClick={handleShare} className="h-7 w-7 rounded-md hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors" title={m('share')}>
                                        <Share2 className="h-3.5 w-3.5" />
                                    </button>
                                </>
                            ) : (
                                <button
                                    onClick={handleStart}
                                    className="h-7 px-2.5 rounded-md bg-blue-500 hover:bg-blue-600 text-white text-xs flex items-center gap-1 transition-colors"
                                >
                                    <Mic className="h-3.5 w-3.5" />{m('startTranscribing')}
                                </button>
                            )}
                        </div>
                    )}
                </div>

                {/* ── Unsupported hint ── */}
                {!speechSupported && (state === 'idle') && (
                    <div contentEditable={false} suppressContentEditableWarning className="px-5 pt-2">
                        <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                            <Lightbulb className="h-3 w-3" />
                            {m('transcriptionUnavailable')}
                        </p>
                    </div>
                )}

                {/* ── Audio player ── */}
                {localAudioUrl && state === 'completed' && (
                    <div contentEditable={false} suppressContentEditableWarning className="mx-5 mt-3 p-2.5 bg-muted/30 rounded-md">
                        <AudioPlayer audioUrl={localAudioUrl} />
                    </div>
                )}

                {/* ── Live transcript preview (during recording, transcript tab) ── */}
                {isBusy && activeTab === 'transcript' && (
                    <div contentEditable={false} suppressContentEditableWarning className="mx-5 mt-3">
                        <div className="text-sm leading-relaxed bg-muted/40 rounded-md p-3 min-h-[48px] max-h-40 overflow-y-auto text-foreground/90 whitespace-pre-wrap">
                            {transcript || <span className="text-muted-foreground italic">{m('listening')}</span>}
                        </div>
                    </div>
                )}

                {/* ── Tab content (editable) ──
                    NodeViewContent renders both child tab nodes; CSS toggles visibility. */}
                <div
                    data-active-tab={activeTab}
                    className="meeting-tabs-container px-5 py-3 meeting-notes-placeholder"
                    data-placeholder={activeTab === 'notes' ? m('notesPlaceholder') : m('transcriptWillAppear')}
                >
                    <NodeViewContent className="min-h-[60px] prose prose-sm dark:prose-invert max-w-none focus:outline-none prose-p:my-1.5 prose-headings:mt-4 prose-headings:mb-2 prose-ul:my-1.5 prose-ol:my-1.5 prose-li:my-0.5" />
                </div>
            </div>
        </NodeViewWrapper>
    );
};
