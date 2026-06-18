import { useCallback } from 'react';
import { Editor } from '@kn/editor';
import { SupportedLanguage } from '../types';
import { useSpeechController } from '../speech-controller';
import { startSpeech } from '../extension/menu/RecordingToast';

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

/**
 * Backward-compatible thin wrapper over the shared {@link useSpeechController}.
 * New code should use the controller (and `startSpeech`) directly; this exists
 * so existing imports of `useSpeechRecognition` keep working.
 */
export const useSpeechRecognition = (
    options: UseSpeechRecognitionOptions
): UseSpeechRecognitionReturn => {
    const { editor, language } = options;
    const { status, error, isSupported, stop } = useSpeechController();

    const startRecording = useCallback(() => {
        startSpeech(editor, language);
    }, [editor, language]);

    return {
        isRecording: status !== 'idle',
        error,
        isSupported,
        startRecording,
        stopRecording: stop,
    };
};
