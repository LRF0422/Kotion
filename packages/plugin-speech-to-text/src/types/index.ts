export type RecordingStatus = 'idle' | 'recording' | 'paused' | 'stopped' | 'error';

export type SupportedLanguage = 'en-US' | 'zh-CN' | 'es-ES' | 'fr-FR' | 'de-DE' | 'ja-JP';

export interface SpeechToTextAttributes {
    status: RecordingStatus;
    transcript: string;
    language: SupportedLanguage;
}

export interface LanguageOption {
    code: SupportedLanguage;
    label: string;
}

export const SUPPORTED_LANGUAGES: LanguageOption[] = [
    { code: 'en-US', label: 'English (US)' },
    { code: 'zh-CN', label: '中文 (Chinese)' },
    { code: 'es-ES', label: 'Español (Spanish)' },
    { code: 'fr-FR', label: 'Français (French)' },
    { code: 'de-DE', label: 'Deutsch (German)' },
    { code: 'ja-JP', label: '日本語 (Japanese)' },
];
