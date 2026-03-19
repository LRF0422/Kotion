import { useState, useEffect, useRef, useCallback } from 'react';
import { toast } from '@kn/ui';

export interface UseMeetingRecorderOptions {
    onTranscriptionUpdate?: (text: string) => void;
    onTranscriptionComplete?: (text: string) => void;
}

export interface UseMeetingRecorderReturn {
    isRecording: boolean;
    isPaused: boolean;
    duration: number;
    audioUrl: string | null;
    error: string | null;
    startRecording: () => Promise<void>;
    pauseRecording: () => void;
    resumeRecording: () => void;
    stopRecording: () => Promise<{ audioBlob: Blob; transcript: string } | null>;
}

export const useMeetingRecorder = (
    options: UseMeetingRecorderOptions = {}
): UseMeetingRecorderReturn => {
    const { onTranscriptionUpdate, onTranscriptionComplete } = options;
    const [isRecording, setIsRecording] = useState(false);
    const [isPaused, setIsPaused] = useState(false);
    const [duration, setDuration] = useState(0);
    const [audioUrl, setAudioUrl] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);
    const streamRef = useRef<MediaStream | null>(null);
    const durationIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const recognitionRef = useRef<any>(null);
    const transcriptRef = useRef<string>('');
    const audioBlobRef = useRef<Blob | null>(null);

    // Cleanup function
    const cleanup = useCallback(() => {
        if (durationIntervalRef.current) {
            clearInterval(durationIntervalRef.current);
            durationIntervalRef.current = null;
        }
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
        }
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
            mediaRecorderRef.current.stop();
        }
        mediaRecorderRef.current = null;
        if (recognitionRef.current) {
            try { recognitionRef.current.stop(); } catch (_) {}
            recognitionRef.current = null;
        }
    }, []);

    // Check browser support
    const isSupported = typeof window !== 'undefined' &&
        navigator.mediaDevices && navigator.mediaDevices.getUserMedia;

    // Initialize speech recognition
    const initSpeechRecognition = useCallback(() => {
        const SpeechRecognition = (window as any).SpeechRecognition ||
            (window as any).webkitSpeechRecognition;
        if (!SpeechRecognition) return null;

        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = false;
        recognition.lang = 'zh-CN';
        recognition.maxAlternatives = 1;

        recognition.onresult = (event: any) => {
            for (let i = event.resultIndex; i < event.results.length; i++) {
                if (event.results[i].isFinal) {
                    const text = event.results[i][0].transcript;
                    transcriptRef.current += text + ' ';
                    onTranscriptionUpdate?.(transcriptRef.current);
                }
            }
        };

        recognition.onerror = (event: any) => {
            console.error('Speech recognition error:', event.error);
            if (event.error !== 'aborted') {
                // Continue recording even if speech recognition fails
            }
        };

        return recognition;
    }, [onTranscriptionUpdate]);

    const startRecording = useCallback(async () => {
        if (!isSupported) {
            setError('此浏览器不支持录音功能，请使用 Chrome 或 Edge。');
            toast.error('此浏览器不支持录音功能');
            return;
        }

        try {
            setError(null);
            audioChunksRef.current = [];
            transcriptRef.current = '';

            // Request microphone access
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            streamRef.current = stream;

            // Create MediaRecorder
            const mediaRecorder = new MediaRecorder(stream, {
                mimeType: 'audio/webm;codecs=opus'
            });
            mediaRecorderRef.current = mediaRecorder;

            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    audioChunksRef.current.push(event.data);
                }
            };

            // Start recording
            mediaRecorder.start(100); // Collect data every 100ms
            setIsRecording(true);
            setIsPaused(false);
            setDuration(0);

            // Start duration timer
            durationIntervalRef.current = setInterval(() => {
                setDuration(d => d + 1);
            }, 1000);

            // Start speech recognition
            const recognition = initSpeechRecognition();
            if (recognition) {
                recognition.start();
                recognitionRef.current = recognition;
            }

            toast.success('开始录音');

        } catch (err: any) {
            console.error('Error starting recording:', err);
            if (err.name === 'NotAllowedError') {
                setError('麦克风权限被拒绝，请在浏览器设置中允许访问麦克风。');
                toast.error('麦克风权限被拒绝');
            } else if (err.name === 'NotFoundError') {
                setError('未找到麦克风设备，请确保麦克风已连接。');
                toast.error('未找到麦克风设备');
            } else {
                setError('启动录音失败，请重试。');
                toast.error('启动录音失败');
            }
            cleanup();
        }
    }, [isSupported, cleanup, initSpeechRecognition]);

    const pauseRecording = useCallback(() => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
            mediaRecorderRef.current.pause();
            setIsPaused(true);
            if (durationIntervalRef.current) {
                clearInterval(durationIntervalRef.current);
                durationIntervalRef.current = null;
            }
            if (recognitionRef.current) {
                try { recognitionRef.current.stop(); } catch (_) {}
            }
            toast.info('暂停录音');
        }
    }, []);

    const resumeRecording = useCallback(() => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'paused') {
            mediaRecorderRef.current.resume();
            setIsPaused(false);
            durationIntervalRef.current = setInterval(() => {
                setDuration(d => d + 1);
            }, 1000);
            if (recognitionRef.current) {
                try { recognitionRef.current.start(); } catch (_) {}
            }
            toast.success('继续录音');
        }
    }, []);

    const stopRecording = useCallback(async (): Promise<{ audioBlob: Blob; transcript: string } | null> => {
        return new Promise((resolve) => {
            if (!mediaRecorderRef.current) {
                resolve(null);
                return;
            }

            const finalTranscript = transcriptRef.current;

            mediaRecorderRef.current.onstop = () => {
                const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
                audioBlobRef.current = audioBlob;
                const url = URL.createObjectURL(audioBlob);
                setAudioUrl(url);
                setIsRecording(false);
                setIsPaused(false);

                if (durationIntervalRef.current) {
                    clearInterval(durationIntervalRef.current);
                    durationIntervalRef.current = null;
                }

                if (recognitionRef.current) {
                    try { recognitionRef.current.stop(); } catch (_) {}
                }

                toast.success('录音已停止');
                onTranscriptionComplete?.(finalTranscript);

                resolve({ audioBlob, transcript: finalTranscript });
            };

            mediaRecorderRef.current.stop();
            streamRef.current?.getTracks().forEach(track => track.stop());
        });
    }, [onTranscriptionComplete]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            cleanup();
            if (audioUrl) {
                URL.revokeObjectURL(audioUrl);
            }
        };
    }, [cleanup, audioUrl]);

    return {
        isRecording,
        isPaused,
        duration,
        audioUrl,
        error,
        startRecording,
        pauseRecording,
        resumeRecording,
        stopRecording,
    };
};
