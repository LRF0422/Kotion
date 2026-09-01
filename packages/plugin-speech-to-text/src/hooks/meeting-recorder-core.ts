export type MeetingRecorderStatus =
    | 'idle'
    | 'requestingPermission'
    | 'recording'
    | 'paused'
    | 'stopping'
    | 'captured'
    | 'error';

export interface MeetingRecorderState {
    status: MeetingRecorderStatus;
    duration: number;
    error: string | null;
    mimeType: string;
    audioBlob: Blob | null;
    transcript: string;
}

export type MeetingRecorderAction =
    | { type: 'requestPermission' }
    | { type: 'started'; mimeType: string }
    | { type: 'duration'; seconds: number }
    | { type: 'paused' }
    | { type: 'resumed' }
    | { type: 'stopping' }
    | { type: 'captured'; audioBlob: Blob; transcript: string; mimeType: string; duration: number }
    | { type: 'failed'; error: string }
    | { type: 'reset' };

export const initialMeetingRecorderState: MeetingRecorderState = {
    status: 'idle',
    duration: 0,
    error: null,
    mimeType: '',
    audioBlob: null,
    transcript: '',
};

export const meetingRecorderReducer = (
    state: MeetingRecorderState,
    action: MeetingRecorderAction,
): MeetingRecorderState => {
    switch (action.type) {
        case 'requestPermission':
            return {
                ...initialMeetingRecorderState,
                status: 'requestingPermission',
            };
        case 'started':
            return {
                ...state,
                status: 'recording',
                error: null,
                mimeType: action.mimeType,
            };
        case 'duration':
            return {
                ...state,
                duration: Math.max(state.duration, Math.max(0, Math.floor(action.seconds))),
            };
        case 'paused':
            return state.status === 'recording' ? { ...state, status: 'paused' } : state;
        case 'resumed':
            return state.status === 'paused' ? { ...state, status: 'recording' } : state;
        case 'stopping':
            return state.status === 'recording' || state.status === 'paused'
                ? { ...state, status: 'stopping' }
                : state;
        case 'captured':
            return {
                ...state,
                status: 'captured',
                duration: Math.max(state.duration, Math.max(0, Math.floor(action.duration))),
                error: null,
                audioBlob: action.audioBlob,
                transcript: action.transcript,
                mimeType: action.mimeType,
            };
        case 'failed':
            return {
                ...state,
                status: 'error',
                error: action.error,
            };
        case 'reset':
            return initialMeetingRecorderState;
        default:
            return state;
    }
};

export const MEETING_AUDIO_MIME_CANDIDATES = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4;codecs=mp4a.40.2',
    'audio/mp4',
    'audio/ogg;codecs=opus',
] as const;

/**
 * Pick the first MediaRecorder type supported by the current browser. Returning
 * an empty string intentionally asks MediaRecorder to choose its native default.
 */
export const negotiateMeetingAudioMimeType = (
    isTypeSupported: ((mimeType: string) => boolean) | undefined,
    candidates: readonly string[] = MEETING_AUDIO_MIME_CANDIDATES,
): string => {
    if (!isTypeSupported) return '';
    for (const mimeType of candidates) {
        try {
            if (isTypeSupported(mimeType)) return mimeType;
        } catch {
            // A browser-specific implementation may reject an unfamiliar value.
        }
    }
    return '';
};

export const extensionForMeetingAudioMimeType = (mimeType: string): string => {
    const normalized = mimeType.toLowerCase();
    if (normalized.includes('mp4')) return 'm4a';
    if (normalized.includes('ogg')) return 'ogg';
    return 'webm';
};
