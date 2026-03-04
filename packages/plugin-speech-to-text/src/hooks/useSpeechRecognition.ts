import { useState, useEffect, useRef, useCallback } from 'react';
import { SupportedLanguage } from '../types';
import { Editor } from '@kn/editor';
import { toast } from '@kn/ui';

export interface UseSpeechRecognitionOptions {
    language?: SupportedLanguage;
    editor: Editor;
}

export interface UseSpeechRecognitionReturn {
    isRecording: boolean;
    error: string | null;
    isSupported: boolean;
    startRecording: () => void;
    stopRecording: () => void;
}

export const useSpeechRecognition = (
    options: UseSpeechRecognitionOptions
): UseSpeechRecognitionReturn => {
    const { editor, language = 'en-US' } = options;
    const [isRecording, setIsRecording] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);

    const recognitionRef = useRef<any>(null);
    const editorRef = useRef<Editor>(editor);
    const toastIdRef = useRef<string | number | null>(null);

    // Keep editorRef in sync
    useEffect(() => {
        editorRef.current = editor;
    }, [editor]);

    // Check browser support
    const isSupported = typeof window !== 'undefined' &&
        ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);

    // Initialize speech recognition
    useEffect(() => {
        if (!isSupported) {
            return;
        }

        const SpeechRecognition = (window as any).SpeechRecognition ||
            (window as any).webkitSpeechRecognition;

        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = false;
        recognition.lang = language;
        recognition.maxAlternatives = 1;

        recognition.onstart = () => {
            setIsRecording(true);
            setError(null);
            toastIdRef.current = toast.loading('语音识别中...', {
                duration: Infinity,
            });
        };

        recognition.onresult = (event: any) => {
            for (let i = event.resultIndex; i < event.results.length; i++) {
                if (event.results[i].isFinal) {
                    const text = event.results[i][0].transcript;
                    const currentEditor = editorRef.current;
                    if (currentEditor && text) {
                        currentEditor.commands.insertContent(text);
                    }
                }
            }
        };

        recognition.onerror = (event: any) => {
            console.error('Speech recognition error:', event.error);

            // Dismiss loading toast
            if (toastIdRef.current !== null) {
                toast.dismiss(toastIdRef.current);
                toastIdRef.current = null;
            }

            let errorMessage = 'An error occurred during speech recognition.';

            switch (event.error) {
                case 'no-speech':
                    errorMessage = 'No speech was detected. Please try again.';
                    break;
                case 'audio-capture':
                    errorMessage = 'No microphone was found. Ensure a microphone is installed.';
                    break;
                case 'not-allowed':
                    errorMessage = 'Microphone permission was denied. Please allow microphone access.';
                    break;
                case 'network':
                    errorMessage = 'Network error occurred. Please check your connection.';
                    break;
                case 'aborted':
                    break;
                default:
                    errorMessage = `Speech recognition error: ${event.error}`;
            }

            if (event.error !== 'aborted') {
                setError(errorMessage);
                toast.error(errorMessage);
            }
            setIsRecording(false);
        };

        recognition.onend = () => {
            setIsRecording(false);
            if (toastIdRef.current !== null) {
                toast.dismiss(toastIdRef.current);
                toast.success('语音识别已结束');
                toastIdRef.current = null;
            }
        };

        recognitionRef.current = recognition;

        return () => {
            if (recognitionRef.current) {
                try { recognitionRef.current.stop(); } catch (_) { }
            }
        };
    }, [isSupported, language]);

    const startRecording = useCallback(() => {
        if (!isSupported) {
            setError('Speech recognition is not supported in this browser.');
            return;
        }

        if (recognitionRef.current && !isRecording) {
            try {
                setError(null);
                recognitionRef.current.start();
            } catch (err) {
                console.error('Error starting recognition:', err);
                setError('Failed to start recording. Please try again.');
            }
        }
    }, [isSupported, isRecording]);

    const stopRecording = useCallback(() => {
        if (recognitionRef.current && isRecording) {
            recognitionRef.current.stop();
        }
    }, [isRecording]);

    return {
        isRecording,
        error,
        isSupported,
        startRecording,
        stopRecording,
    };
};
