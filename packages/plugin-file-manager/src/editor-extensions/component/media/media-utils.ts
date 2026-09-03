export type ResolvedMediaKind = 'audio' | 'video';

export const formatMediaTime = (seconds: number): string => {
    if (!Number.isFinite(seconds) || seconds < 0) return '00:00';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    const base = `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
    return hours > 0 ? `${hours.toString().padStart(2, '0')}:${base}` : base;
};

export const getEffectiveDuration = (
    nativeDuration: number,
    seekableEnd = 0,
    fallbackDuration = 0,
): number => {
    if (Number.isFinite(nativeDuration) && nativeDuration > 0) return nativeDuration;
    if (Number.isFinite(seekableEnd) && seekableEnd > 0) return seekableEnd;
    if (Number.isFinite(fallbackDuration) && fallbackDuration > 0) return fallbackDuration;
    return 0;
};

export const clampMediaSeek = (value: number, duration: number): number => {
    if (!Number.isFinite(value)) return 0;
    const end = Number.isFinite(duration) && duration > 0 ? duration : Number.POSITIVE_INFINITY;
    return Math.min(Math.max(value, 0), end);
};

export const resolveMediaKindFromDimensions = (
    videoWidth: number,
    videoHeight: number,
): ResolvedMediaKind | null => {
    if (!Number.isFinite(videoWidth) || !Number.isFinite(videoHeight) || videoWidth < 0 || videoHeight < 0) {
        return null;
    }
    return videoWidth > 0 || videoHeight > 0 ? 'video' : 'audio';
};
