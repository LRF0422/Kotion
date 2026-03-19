import { Mic, MicOff, X } from "@kn/icon";
import { Button } from "@kn/ui";
import { cn } from "@kn/ui";
import React, { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { useSpeechRecognition } from "../../hooks/useSpeechRecognition";
import { Editor } from "@kn/editor";

const SPEECH_PANEL_EVENT = 'speech-to-text-panel-open';

export const dispatchSpeechPanelOpen = () => {
    document.dispatchEvent(new CustomEvent(SPEECH_PANEL_EVENT));
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
        <div
            ref={containerRef}
            className="flex items-center justify-center gap-1 h-10"
        >
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

export const SpeechToTextPanel: React.FC<{ editor: Editor }> = ({ editor }) => {
    const [isOpen, setIsOpen] = useState(false);
    const panelRef = useRef<HTMLDivElement>(null);

    const {
        isRecording,
        isSupported,
        startRecording,
        stopRecording,
        error,
    } = useSpeechRecognition({ editor });

    // Listen for open event
    useEffect(() => {
        const handleOpen = () => {
            if (isSupported && !isOpen) {
                setIsOpen(true);
                // Auto-start recording when panel opens
                setTimeout(() => {
                    if (!isRecording) {
                        startRecording();
                    }
                }, 100);
            }
        };

        document.addEventListener(SPEECH_PANEL_EVENT, handleOpen);
        return () => document.removeEventListener(SPEECH_PANEL_EVENT, handleOpen);
    }, [isSupported, isOpen, isRecording, startRecording]);

    // Handle escape key
    useEffect(() => {
        if (!isOpen) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                handleClose();
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [isOpen]);

    // Handle click outside
    useEffect(() => {
        if (!isOpen) return;

        const handleClickOutside = (e: MouseEvent) => {
            if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
                // Check if click is on the trigger button
                const triggerButton = document.querySelector('[data-speech-to-text-trigger]');
                if (triggerButton && triggerButton.contains(e.target as Node)) {
                    return;
                }
                handleClose();
            }
        };

        // Delay adding the listener to avoid immediate close
        const timer = setTimeout(() => {
            document.addEventListener('mousedown', handleClickOutside);
        }, 100);

        return () => {
            clearTimeout(timer);
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isOpen]);

    const handleClose = useCallback(() => {
        if (isRecording) {
            stopRecording();
        }
        setIsOpen(false);
    }, [isRecording, stopRecording]);

    const handleStop = useCallback(() => {
        stopRecording();
        setIsOpen(false);
    }, [stopRecording]);

    if (!isOpen) return null;

    return createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/40 backdrop-blur-sm"
                onClick={handleClose}
            />

            {/* Panel */}
            <div
                ref={panelRef}
                className="relative w-72 bg-background rounded-2xl shadow-2xl border border-border/50 overflow-hidden animate-in fade-in-0 zoom-in-95 duration-200"
            >
                {/* Gradient header */}
                <div className="absolute top-0 left-0 right-0 h-24 bg-gradient-to-br from-indigo-500/10 via-purple-500/10 to-transparent pointer-events-none" />

                {/* Header */}
                <div className="relative flex items-center justify-between px-4 pt-4 pb-2">
                    <div className="flex items-center gap-2">
                        <div className="relative">
                            <div className="absolute inset-0 bg-gradient-to-br from-indigo-500 to-purple-500 rounded-xl blur-md opacity-30" />
                            <div className="relative p-2 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-500 shadow-lg shadow-indigo-500/20">
                                {isRecording
                                    ? <MicOff className="h-4 w-4 text-white animate-pulse" />
                                    : <Mic className="h-4 w-4 text-white" />
                                }
                            </div>
                        </div>
                        <h2 className="text-base font-semibold text-foreground">语音转文字</h2>
                    </div>
                    <button
                        onClick={handleClose}
                        className="h-8 w-8 rounded-full hover:bg-muted flex items-center justify-center transition-colors text-muted-foreground hover:text-foreground"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>

                {/* Content */}
                <div className="relative px-4 pb-4 pt-2">
                    {/* Status */}
                    <div className="text-center py-4">
                        <p className={cn(
                            "text-sm font-medium",
                            isRecording ? "text-foreground" : "text-muted-foreground"
                        )}>
                            {isRecording ? '正在聆听...' : '准备中...'}
                        </p>
                    </div>

                    {/* Microphone circle */}
                    <div className="flex justify-center py-2">
                        <div className={cn(
                            "relative w-20 h-20 rounded-full flex items-center justify-center transition-all duration-300",
                            isRecording
                                ? "bg-gradient-to-br from-indigo-500/20 to-purple-500/20"
                                : "bg-muted"
                        )}>
                            <div className={cn(
                                "absolute inset-0 rounded-full flex items-center justify-center transition-all duration-300",
                                isRecording && "animate-pulse bg-gradient-to-br from-indigo-500/10 to-purple-500/10"
                            )} />
                            <Mic className={cn(
                                "h-8 w-8 transition-colors",
                                isRecording ? "text-indigo-500" : "text-muted-foreground"
                            )} />
                        </div>
                    </div>

                    {/* Waveform */}
                    <div className="py-2">
                        <WaveformIndicator isActive={isRecording} />
                    </div>

                    {/* Error message */}
                    {error && (
                        <div className="mt-2 px-3 py-2 rounded-lg bg-destructive/10 text-destructive text-xs text-center">
                            {error}
                        </div>
                    )}

                    {/* Stop button */}
                    <div className="mt-4">
                        <Button
                            variant="destructive"
                            className="w-full h-10 rounded-xl gap-2 shadow-lg"
                            onClick={handleStop}
                        >
                            <MicOff className="h-4 w-4" />
                            停止
                        </Button>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
};
