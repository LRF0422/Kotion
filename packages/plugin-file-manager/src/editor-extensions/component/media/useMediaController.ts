import { useCallback, useEffect, useRef, useState } from 'react';
import { logger } from '@kn/common';
import { clampMediaSeek, getEffectiveDuration } from './media-utils';

export type MediaPlaybackError = 'load' | 'playback' | null;

interface UseMediaControllerOptions {
    src: string;
    label: string;
    fallbackDuration?: number;
}

const getSeekableEnd = (media: HTMLMediaElement): number => {
    if (media.seekable.length === 0) return 0;
    return media.seekable.end(media.seekable.length - 1);
};

export const useMediaController = <T extends HTMLMediaElement>({
    src,
    label,
    fallbackDuration = 0,
}: UseMediaControllerOptions) => {
    const mediaRef = useRef<T>(null);
    const playGenerationRef = useRef(0);
    const lastAudibleVolumeRef = useRef(1);
    const labelRef = useRef(label);
    const [playing, setPlaying] = useState(false);
    const [ended, setEnded] = useState(false);
    const [loading, setLoading] = useState(true);
    const [buffering, setBuffering] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [volume, setVolumeState] = useState(1);
    const [muted, setMuted] = useState(false);
    const [error, setError] = useState<MediaPlaybackError>(null);

    const syncDuration = useCallback((media: HTMLMediaElement) => {
        setDuration(getEffectiveDuration(media.duration, getSeekableEnd(media), fallbackDuration));
    }, [fallbackDuration]);

    useEffect(() => {
        labelRef.current = label;
    }, [label]);

    useEffect(() => {
        const media = mediaRef.current;
        if (!media || !src) return;
        playGenerationRef.current += 1;

        setPlaying(false);
        setEnded(false);
        setLoading(true);
        setBuffering(false);
        setCurrentTime(0);
        setDuration(0);
        setError(null);

        const onLoadStart = () => setLoading(true);
        const onMetadata = () => {
            syncDuration(media);
            setLoading(false);
        };
        const onDuration = () => syncDuration(media);
        const onCanPlay = () => {
            syncDuration(media);
            setLoading(false);
            setBuffering(false);
        };
        const onPlaying = () => {
            setPlaying(true);
            setEnded(false);
            setLoading(false);
            setBuffering(false);
            setError(null);
        };
        const onPause = () => {
            setPlaying(false);
            setBuffering(false);
        };
        const onWaiting = () => {
            if (!media.paused && !media.ended) setBuffering(true);
        };
        const onTime = () => {
            setCurrentTime(Number.isFinite(media.currentTime) ? media.currentTime : 0);
            syncDuration(media);
        };
        const onVolume = () => {
            setVolumeState(media.volume);
            setMuted(media.muted);
            if (!media.muted && media.volume > 0) lastAudibleVolumeRef.current = media.volume;
        };
        const onEnded = () => {
            setPlaying(false);
            setEnded(true);
            setBuffering(false);
            syncDuration(media);
        };
        const onError = () => {
            setPlaying(false);
            setLoading(false);
            setBuffering(false);
            setError('load');
            logger.error('Failed to load media preview', { label: labelRef.current, code: media.error?.code });
        };

        media.addEventListener('loadstart', onLoadStart);
        media.addEventListener('loadedmetadata', onMetadata);
        media.addEventListener('loadeddata', onDuration);
        media.addEventListener('durationchange', onDuration);
        media.addEventListener('progress', onDuration);
        media.addEventListener('canplay', onCanPlay);
        media.addEventListener('playing', onPlaying);
        media.addEventListener('pause', onPause);
        media.addEventListener('waiting', onWaiting);
        media.addEventListener('stalled', onWaiting);
        media.addEventListener('timeupdate', onTime);
        media.addEventListener('volumechange', onVolume);
        media.addEventListener('ended', onEnded);
        media.addEventListener('error', onError);
        media.preload = 'metadata';
        media.src = src;
        media.load();

        return () => {
            playGenerationRef.current += 1;
            media.pause();
            media.removeEventListener('loadstart', onLoadStart);
            media.removeEventListener('loadedmetadata', onMetadata);
            media.removeEventListener('loadeddata', onDuration);
            media.removeEventListener('durationchange', onDuration);
            media.removeEventListener('progress', onDuration);
            media.removeEventListener('canplay', onCanPlay);
            media.removeEventListener('playing', onPlaying);
            media.removeEventListener('pause', onPause);
            media.removeEventListener('waiting', onWaiting);
            media.removeEventListener('stalled', onWaiting);
            media.removeEventListener('timeupdate', onTime);
            media.removeEventListener('volumechange', onVolume);
            media.removeEventListener('ended', onEnded);
            media.removeEventListener('error', onError);
            media.removeAttribute('src');
            media.load();
        };
    }, [src, syncDuration]);

    const togglePlayback = useCallback(async () => {
        const media = mediaRef.current;
        if (!media) return;
        if (!media.paused) {
            playGenerationRef.current += 1;
            media.pause();
            return;
        }

        const generation = ++playGenerationRef.current;
        setError(null);
        if (media.ended || ended || (duration > 0 && media.currentTime >= duration)) {
            media.currentTime = 0;
            setCurrentTime(0);
            setEnded(false);
        }
        try {
            await media.play();
        } catch (playError) {
            if (generation !== playGenerationRef.current) return;
            if (playError instanceof DOMException && playError.name === 'AbortError') return;
            setPlaying(false);
            setBuffering(false);
            setError('playback');
            logger.error('Failed to start media preview playback', { label: labelRef.current, error: playError });
        }
    }, [duration, ended]);

    const seek = useCallback((value: number) => {
        const media = mediaRef.current;
        if (!media) return;
        const next = clampMediaSeek(value, duration || getSeekableEnd(media));
        media.currentTime = next;
        setCurrentTime(next);
        if (!duration || next < duration) setEnded(false);
    }, [duration]);

    const skip = useCallback((seconds: number) => {
        const media = mediaRef.current;
        if (!media) return;
        seek(media.currentTime + seconds);
    }, [seek]);

    const setVolume = useCallback((value: number) => {
        const media = mediaRef.current;
        if (!media) return;
        const next = Math.min(Math.max(value, 0), 1);
        media.volume = next;
        media.muted = next === 0;
    }, []);

    const toggleMute = useCallback(() => {
        const media = mediaRef.current;
        if (!media) return;
        if (media.muted || media.volume === 0) {
            media.muted = false;
            if (media.volume === 0) media.volume = lastAudibleVolumeRef.current || 1;
        } else {
            lastAudibleVolumeRef.current = media.volume;
            media.muted = true;
        }
    }, []);

    const retry = useCallback(() => {
        const media = mediaRef.current;
        if (!media) return;
        playGenerationRef.current += 1;
        setError(null);
        setLoading(true);
        setBuffering(false);
        media.load();
    }, []);

    return {
        mediaRef,
        playing,
        ended,
        loading,
        buffering,
        currentTime,
        duration,
        volume,
        muted,
        error,
        togglePlayback,
        seek,
        skip,
        setVolume,
        toggleMute,
        retry,
    };
};
