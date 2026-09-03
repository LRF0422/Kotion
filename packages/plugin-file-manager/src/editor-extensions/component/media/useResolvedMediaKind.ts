import { useCallback, useEffect, useRef, useState } from 'react';
import type { PreviewKind } from '../../../utils/fileUtils';
import { resolveMediaKindFromDimensions, type ResolvedMediaKind } from './media-utils';

export type MediaResolutionStatus = 'idle' | 'probing' | 'resolved' | 'error';

interface ResolvedMediaKindState {
    kind: ResolvedMediaKind | null;
    status: MediaResolutionStatus;
    retry: () => void;
}

interface ResolutionSnapshot {
    key: string;
    kind: ResolvedMediaKind | null;
    status: MediaResolutionStatus;
}

const PROBE_TIMEOUT_MS = 30_000;

export const useResolvedMediaKind = (
    previewKind: PreviewKind,
    src: string,
    enabled: boolean,
): ResolvedMediaKindState => {
    const directKind = previewKind === 'audio' || previewKind === 'video' ? previewKind : null;
    const [retryVersion, setRetryVersion] = useState(0);
    const key = `${previewKind}:${src}:${retryVersion}`;
    const [resolution, setResolution] = useState<ResolutionSnapshot>({ key: '', kind: null, status: 'idle' });
    const generationRef = useRef(0);

    const retry = useCallback(() => setRetryVersion((version) => version + 1), []);

    useEffect(() => {
        const generation = ++generationRef.current;
        if (!enabled || !src || directKind || previewKind !== 'media') return;

        const probe = document.createElement('video');
        let settled = false;
        let timeout: number | null = null;
        setResolution({ key, kind: null, status: 'probing' });

        const release = () => {
            if (timeout !== null) {
                window.clearTimeout(timeout);
                timeout = null;
            }
            probe.removeEventListener('loadedmetadata', onMetadata);
            probe.removeEventListener('error', onError);
            probe.pause();
            probe.removeAttribute('src');
            probe.load();
        };
        const finish = (nextKind: ResolvedMediaKind | null) => {
            if (settled || generation !== generationRef.current) return;
            settled = true;
            release();
            setResolution({ key, kind: nextKind, status: nextKind ? 'resolved' : 'error' });
        };
        const onMetadata = () => finish(resolveMediaKindFromDimensions(probe.videoWidth, probe.videoHeight));
        const onError = () => finish(null);

        probe.preload = 'metadata';
        probe.muted = true;
        probe.playsInline = true;
        probe.addEventListener('loadedmetadata', onMetadata);
        probe.addEventListener('error', onError);
        timeout = window.setTimeout(() => finish(null), PROBE_TIMEOUT_MS);
        probe.src = src;
        probe.load();

        return () => {
            settled = true;
            release();
        };
    }, [directKind, enabled, key, previewKind, src]);

    if (directKind) return { kind: directKind, status: 'resolved', retry };
    if (!enabled || !src || previewKind !== 'media') return { kind: null, status: 'idle', retry };
    if (resolution.key !== key) return { kind: null, status: 'probing', retry };
    return { kind: resolution.kind, status: resolution.status, retry };
};
