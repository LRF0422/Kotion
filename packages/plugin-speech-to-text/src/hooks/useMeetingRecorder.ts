import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { logger } from '@kn/common';
import {
    initialMeetingRecorderState,
    meetingRecorderReducer,
    negotiateMeetingAudioMimeType,
    type MeetingRecorderAction,
    type MeetingRecorderState,
    type MeetingRecorderStatus,
} from './meeting-recorder-core';

interface SpeechRecognitionResultEventLike {
    resultIndex: number;
    results: ArrayLike<{
        isFinal: boolean;
        0: { transcript: string };
    }>;
}

interface SpeechRecognitionErrorEventLike {
    error?: string;
}

interface SpeechRecognitionLike {
    continuous: boolean;
    interimResults: boolean;
    lang: string;
    maxAlternatives: number;
    onresult: ((event: SpeechRecognitionResultEventLike) => void) | null;
    onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
    onend: (() => void) | null;
    start(): void;
    stop(): void;
    abort(): void;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

declare global {
    interface Window {
        SpeechRecognition?: SpeechRecognitionConstructor;
        webkitSpeechRecognition?: SpeechRecognitionConstructor;
    }
}

export interface UseMeetingRecorderOptions {
    /** Speech-recognition language (BCP-47), e.g. 'zh-CN', 'en-US'. */
    lang?: string;
    onTranscriptionUpdate?: (text: string) => void;
    onTranscriptionComplete?: (text: string) => void;
}

export interface MeetingRecordingCapture {
    audioBlob: Blob;
    transcript: string;
    mimeType: string;
    duration: number;
}

export type MeetingRecorderStartResult =
    | { success: true; mimeType: string }
    | { success: false; error: string };

export interface UseMeetingRecorderReturn {
    state: MeetingRecorderState;
    status: MeetingRecorderStatus;
    isRecording: boolean;
    isPaused: boolean;
    duration: number;
    audioBlob: Blob | null;
    audioUrl: string | null;
    error: string | null;
    speechSupported: boolean;
    startRecording: () => Promise<MeetingRecorderStartResult>;
    pauseRecording: () => boolean;
    resumeRecording: () => boolean;
    stopRecording: () => Promise<MeetingRecordingCapture | null>;
    resetRecording: () => void;
}

const FINAL_RESULT_GRACE_MS = 700;
const RECOGNITION_RESTART_DELAY_MS = 150;
const DURATION_TICK_MS = 250;

const getNow = (): number => (
    typeof performance !== 'undefined' && typeof performance.now === 'function'
        ? performance.now()
        : Date.now()
);

const getErrorMessage = (error: unknown): string => {
    const name = error instanceof DOMException ? error.name : '';
    if (name === 'NotAllowedError' || name === 'SecurityError') {
        return '麦克风权限被拒绝，请在浏览器设置中允许访问麦克风。';
    }
    if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
        return '未找到麦克风设备，请确保麦克风已连接。';
    }
    if (name === 'NotReadableError' || name === 'TrackStartError') {
        return '麦克风正被其他应用占用，请稍后重试。';
    }
    return '启动录音失败，请重试。';
};

export const useMeetingRecorder = (
    options: UseMeetingRecorderOptions = {},
): UseMeetingRecorderReturn => {
    const { lang = 'zh-CN' } = options;
    const [state, rawDispatch] = useReducer(meetingRecorderReducer, initialMeetingRecorderState);
    const [audioUrl, setAudioUrl] = useState<string | null>(null);

    const stateRef = useRef(state);
    const mountedRef = useRef(true);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const chunksRef = useRef<Blob[]>([]);
    const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
    const recognitionGenerationRef = useRef(0);
    const recognitionShouldRunRef = useRef(false);
    const recognitionEndResolverRef = useRef<(() => void) | null>(null);
    const restartRecognitionRef = useRef<() => boolean>(() => false);
    const transcriptRef = useRef('');
    const interimTranscriptRef = useRef('');
    const onUpdateRef = useRef(options.onTranscriptionUpdate);
    const onCompleteRef = useRef(options.onTranscriptionComplete);
    const durationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const accumulatedDurationMsRef = useRef(0);
    const activeDurationStartedAtRef = useRef<number | null>(null);
    const stopPromiseRef = useRef<Promise<MeetingRecordingCapture | null> | null>(null);
    const audioUrlRef = useRef<string | null>(null);

    useEffect(() => {
        onUpdateRef.current = options.onTranscriptionUpdate;
        onCompleteRef.current = options.onTranscriptionComplete;
    }, [options.onTranscriptionComplete, options.onTranscriptionUpdate]);

    const dispatch = useCallback((action: MeetingRecorderAction) => {
        stateRef.current = meetingRecorderReducer(stateRef.current, action);
        if (mountedRef.current) rawDispatch(action);
    }, []);

    const revokeAudioUrl = useCallback(() => {
        if (audioUrlRef.current) {
            URL.revokeObjectURL(audioUrlRef.current);
            audioUrlRef.current = null;
        }
        if (mountedRef.current) setAudioUrl(null);
    }, []);

    const setCapturedAudioUrl = useCallback((blob: Blob) => {
        revokeAudioUrl();
        const nextUrl = URL.createObjectURL(blob);
        audioUrlRef.current = nextUrl;
        if (mountedRef.current) setAudioUrl(nextUrl);
    }, [revokeAudioUrl]);

    const stopDurationTimer = useCallback(() => {
        if (durationIntervalRef.current) {
            clearInterval(durationIntervalRef.current);
            durationIntervalRef.current = null;
        }
    }, []);

    const currentDurationSeconds = useCallback((): number => {
        const activeStartedAt = activeDurationStartedAtRef.current;
        const activeMs = activeStartedAt === null ? 0 : Math.max(0, getNow() - activeStartedAt);
        return Math.floor((accumulatedDurationMsRef.current + activeMs) / 1000);
    }, []);

    const syncDuration = useCallback(() => {
        dispatch({ type: 'duration', seconds: currentDurationSeconds() });
    }, [currentDurationSeconds, dispatch]);

    const startDurationTimer = useCallback(() => {
        stopDurationTimer();
        durationIntervalRef.current = setInterval(syncDuration, DURATION_TICK_MS);
    }, [stopDurationTimer, syncDuration]);

    const freezeActiveDuration = useCallback(() => {
        const startedAt = activeDurationStartedAtRef.current;
        if (startedAt !== null) {
            accumulatedDurationMsRef.current += Math.max(0, getNow() - startedAt);
            activeDurationStartedAtRef.current = null;
        }
        syncDuration();
    }, [syncDuration]);

    const stopTracks = useCallback(() => {
        streamRef.current?.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
    }, []);

    const publishTranscript = useCallback(() => {
        const liveText = `${transcriptRef.current}${interimTranscriptRef.current}`.trim();
        onUpdateRef.current?.(liveText);
    }, []);

    restartRecognitionRef.current = () => {
        const Recognition = typeof window !== 'undefined'
            ? window.SpeechRecognition ?? window.webkitSpeechRecognition
            : undefined;
        if (!Recognition || !recognitionShouldRunRef.current || stateRef.current.status !== 'recording') {
            return false;
        }

        const generation = ++recognitionGenerationRef.current;
        const recognition = new Recognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = lang || 'zh-CN';
        recognition.maxAlternatives = 1;

        recognition.onresult = (event) => {
            if (generation !== recognitionGenerationRef.current) return;
            let interim = '';
            for (let index = event.resultIndex; index < event.results.length; index += 1) {
                const result = event.results[index];
                const text = result?.[0]?.transcript?.trim();
                if (!text) continue;
                if (result.isFinal) {
                    transcriptRef.current += `${text} `;
                } else {
                    interim += `${text} `;
                }
            }
            interimTranscriptRef.current = interim;
            publishTranscript();
        };

        recognition.onerror = (event) => {
            if (event.error && event.error !== 'aborted' && event.error !== 'no-speech') {
                logger.warn(`Meeting speech recognition error: ${event.error}`);
            }
        };

        recognition.onend = () => {
            if (recognitionRef.current === recognition) recognitionRef.current = null;
            interimTranscriptRef.current = '';
            publishTranscript();
            recognitionEndResolverRef.current?.();
            recognitionEndResolverRef.current = null;

            if (
                generation === recognitionGenerationRef.current
                && recognitionShouldRunRef.current
                && stateRef.current.status === 'recording'
            ) {
                window.setTimeout(() => restartRecognitionRef.current(), RECOGNITION_RESTART_DELAY_MS);
            }
        };

        recognitionRef.current = recognition;
        try {
            recognition.start();
            return true;
        } catch (error) {
            if (recognitionRef.current === recognition) recognitionRef.current = null;
            logger.warn('Failed to start meeting speech recognition', error);
            return false;
        }
    };

    const stopRecognitionWithGrace = useCallback((): Promise<void> => {
        recognitionShouldRunRef.current = false;
        const recognition = recognitionRef.current;
        if (!recognition) return Promise.resolve();

        return new Promise((resolve) => {
            let settled = false;
            const finish = () => {
                if (settled) return;
                settled = true;
                recognitionEndResolverRef.current = null;
                resolve();
            };
            recognitionEndResolverRef.current = finish;
            window.setTimeout(finish, FINAL_RESULT_GRACE_MS);
            try {
                recognition.stop();
            } catch {
                finish();
            }
        });
    }, []);

    const speechSupported = typeof window !== 'undefined'
        && !!(window.SpeechRecognition || window.webkitSpeechRecognition);
    const recordingSupported = typeof window !== 'undefined'
        && typeof MediaRecorder !== 'undefined'
        && !!navigator.mediaDevices?.getUserMedia;

    const startRecording = useCallback(async (): Promise<MeetingRecorderStartResult> => {
        if (stateRef.current.status === 'requestingPermission' || stateRef.current.status === 'recording') {
            return { success: false, error: '录音已在启动或进行中。' };
        }
        if (!recordingSupported || !speechSupported) {
            const error = '会议自动转录需要 Chrome 或 Edge 的录音与语音识别支持。';
            dispatch({ type: 'failed', error });
            return { success: false, error };
        }

        dispatch({ type: 'requestPermission' });
        revokeAudioUrl();
        chunksRef.current = [];
        transcriptRef.current = '';
        interimTranscriptRef.current = '';
        accumulatedDurationMsRef.current = 0;
        activeDurationStartedAtRef.current = null;
        stopPromiseRef.current = null;

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            if (!mountedRef.current) {
                stream.getTracks().forEach((track) => track.stop());
                return { success: false, error: '录音组件已关闭。' };
            }
            streamRef.current = stream;

            const negotiatedMimeType = negotiateMeetingAudioMimeType(
                typeof MediaRecorder.isTypeSupported === 'function'
                    ? MediaRecorder.isTypeSupported.bind(MediaRecorder)
                    : undefined,
            );
            let mediaRecorder: MediaRecorder;
            try {
                mediaRecorder = negotiatedMimeType
                    ? new MediaRecorder(stream, { mimeType: negotiatedMimeType })
                    : new MediaRecorder(stream);
            } catch (error) {
                logger.warn('Negotiated meeting MIME type failed; using browser default', error);
                mediaRecorder = new MediaRecorder(stream);
            }
            mediaRecorderRef.current = mediaRecorder;
            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) chunksRef.current.push(event.data);
            };

            mediaRecorder.start(250);
            const mimeType = mediaRecorder.mimeType || negotiatedMimeType || 'audio/webm';
            activeDurationStartedAtRef.current = getNow();
            dispatch({ type: 'started', mimeType });
            startDurationTimer();

            recognitionShouldRunRef.current = true;
            if (!restartRecognitionRef.current()) {
                recognitionShouldRunRef.current = false;
                try { mediaRecorder.stop(); } catch { /* already inactive */ }
                stopTracks();
                stopDurationTimer();
                const error = '无法启动自动转录，请确认 Chrome 或 Edge 已允许语音识别。';
                dispatch({ type: 'failed', error });
                return { success: false, error };
            }

            return { success: true, mimeType };
        } catch (error) {
            logger.error('Failed to start meeting recording', error);
            recognitionShouldRunRef.current = false;
            recognitionGenerationRef.current += 1;
            try { recognitionRef.current?.abort(); } catch { /* no-op */ }
            recognitionRef.current = null;
            stopDurationTimer();
            stopTracks();
            mediaRecorderRef.current = null;
            const message = getErrorMessage(error);
            dispatch({ type: 'failed', error: message });
            return { success: false, error: message };
        }
    }, [dispatch, recordingSupported, revokeAudioUrl, speechSupported, startDurationTimer, stopDurationTimer, stopTracks]);

    const pauseRecording = useCallback((): boolean => {
        const recorder = mediaRecorderRef.current;
        if (!recorder || recorder.state !== 'recording' || stateRef.current.status !== 'recording') {
            return false;
        }
        recorder.pause();
        freezeActiveDuration();
        stopDurationTimer();
        recognitionShouldRunRef.current = false;
        try { recognitionRef.current?.stop(); } catch { /* already stopped */ }
        dispatch({ type: 'paused' });
        return true;
    }, [dispatch, freezeActiveDuration, stopDurationTimer]);

    const resumeRecording = useCallback((): boolean => {
        const recorder = mediaRecorderRef.current;
        if (!recorder || recorder.state !== 'paused' || stateRef.current.status !== 'paused') {
            return false;
        }
        recorder.resume();
        dispatch({ type: 'resumed' });
        activeDurationStartedAtRef.current = getNow();
        startDurationTimer();

        // A paused recognition object is not reused. Chrome is more reliable when
        // resume always creates a fresh instance.
        recognitionShouldRunRef.current = false;
        recognitionGenerationRef.current += 1;
        try { recognitionRef.current?.abort(); } catch { /* already stopped */ }
        recognitionRef.current = null;
        recognitionShouldRunRef.current = true;
        restartRecognitionRef.current();
        return true;
    }, [dispatch, startDurationTimer]);

    const stopRecording = useCallback(async (): Promise<MeetingRecordingCapture | null> => {
        if (stopPromiseRef.current) return stopPromiseRef.current;
        const recorder = mediaRecorderRef.current;
        if (!recorder || (recorder.state !== 'recording' && recorder.state !== 'paused')) {
            return null;
        }

        const stopPromise = (async () => {
            dispatch({ type: 'stopping' });
            if (activeDurationStartedAtRef.current !== null) freezeActiveDuration();
            stopDurationTimer();

            const recognitionStopped = stopRecognitionWithGrace();
            const recorderStopped = new Promise<void>((resolve) => {
                recorder.onstop = () => resolve();
                try { recorder.requestData(); } catch { /* unsupported while paused in some browsers */ }
                try { recorder.stop(); } catch { resolve(); }
            });

            await Promise.all([recognitionStopped, recorderStopped]);
            stopTracks();
            mediaRecorderRef.current = null;

            const transcript = transcriptRef.current.trim();
            const mimeType = recorder.mimeType || stateRef.current.mimeType || 'audio/webm';
            const audioBlob = new Blob(chunksRef.current, { type: mimeType });
            const duration = currentDurationSeconds();
            const capture = { audioBlob, transcript, mimeType, duration };
            setCapturedAudioUrl(audioBlob);
            dispatch({ type: 'captured', ...capture });
            onCompleteRef.current?.(transcript);
            return capture;
        })().catch((error) => {
            logger.error('Failed to stop meeting recording', error);
            stopTracks();
            const message = '停止录音失败，请重试。';
            dispatch({ type: 'failed', error: message });
            return null;
        }).finally(() => {
            stopPromiseRef.current = null;
        });

        stopPromiseRef.current = stopPromise;
        return stopPromise;
    }, [currentDurationSeconds, dispatch, freezeActiveDuration, setCapturedAudioUrl, stopDurationTimer, stopRecognitionWithGrace, stopTracks]);

    const resetRecording = useCallback(() => {
        if (stateRef.current.status === 'recording' || stateRef.current.status === 'paused') return;
        revokeAudioUrl();
        chunksRef.current = [];
        transcriptRef.current = '';
        interimTranscriptRef.current = '';
        accumulatedDurationMsRef.current = 0;
        activeDurationStartedAtRef.current = null;
        dispatch({ type: 'reset' });
    }, [dispatch, revokeAudioUrl]);

    useEffect(() => {
        stateRef.current = state;
    }, [state]);

    useEffect(() => () => {
        mountedRef.current = false;
        recognitionShouldRunRef.current = false;
        recognitionGenerationRef.current += 1;
        recognitionEndResolverRef.current?.();
        recognitionEndResolverRef.current = null;
        try { recognitionRef.current?.abort(); } catch { /* no-op */ }
        recognitionRef.current = null;
        stopDurationTimer();
        const recorder = mediaRecorderRef.current;
        if (recorder && recorder.state !== 'inactive') {
            recorder.ondataavailable = null;
            recorder.onstop = null;
            try { recorder.stop(); } catch { /* no-op */ }
        }
        mediaRecorderRef.current = null;
        stopTracks();
        if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
        audioUrlRef.current = null;
    }, [stopDurationTimer, stopTracks]);

    return {
        state,
        status: state.status,
        isRecording: state.status === 'recording',
        isPaused: state.status === 'paused',
        duration: state.duration,
        audioBlob: state.audioBlob,
        audioUrl,
        error: state.error,
        speechSupported,
        startRecording,
        pauseRecording,
        resumeRecording,
        stopRecording,
        resetRecording,
    };
};
