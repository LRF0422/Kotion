import { useCallback, useEffect, useRef, useState } from 'react';
import type { PreviewKind } from '../../../utils/fileUtils';
import { resolveMediaKindFromDimensions, type ResolvedMediaKind } from './media-utils';

export type MediaResolutionStatus = 'idle' | 'probing' | 'resolved' | 'error';

interface ResolvedMediaKindState {
    kind: ResolvedMediaKind | null;
    status: MediaResolutionStatus;
    retry: () => void;
}

const PROBE_TIMEOUT_MS = 15_000;

export const useResolvedMediaKind = (
    previewKind: PreviewKind,
    src: string,
    enabled: boolean,
): ResolvedMediaKindState => {
    const directKind = previewKind === 'audio' || previewKind === 'video' ? previewKind : null;
    const [kind, setKind] = useState<ResolvedMediaKind | null>(directKind);
    const [status, setStatus] = useState<MediaResolutionStatus>(directKind ? 'resolved' : 'idle');
    const [retryVersion, setRetryVersion] = useState(0);
    const generationRef = useRef(0);

    const retry = useCallback(() => setRetryVersion((version) => version + 1), []);

    useEffect(() => {
        const generation = ++generationRef.current;
        if (!enabled || !src) {
            setKind(directKind);
            setStatus(directKind ? 'resolved' : 'idle');
            return;
        }
        if (directKind) {
            setKind(directKind);
            setStatus('resolved');
            return;
        }
        if (previewKind !== 'media') {
            setKind(null);
            setStatus('idle');
            return;
        }

        const probe = document.createElement('video');
        let settled = false;
        setKind(null);
        setStatus('probing');

        const finish = (nextKind: ResolvedMediaKind | null) => {
            if (settled || generation !== generationRef.current) return;
            settled = true;
            setKind(nextKind);
            setStatus(nextKind ? 'resolved' : 'error');
        };
        const onMetadata = () => finish(resolveMediaKindFromDimensions(probe.videoWidth, probe.videoHeight));
        const onError = () => finish(null);
        const timeout = window.setTimeout(() => finish(null), PROBE_TIMEOUT_MS);

        probe.preload = 'metadata';
        probe.muted = true;
        probe.playsInline = true;
        probe.addEventListener('loadedmetadata', onMetadata);
        probe.addEventListener('error', onError);
        probe.src = src;
        probe.load();

        return () => {
            settled = true;
            window.clearTimeout(timeout);
            probe.removeEventListener('loadedmetadata', onMetadata);
            probe.removeEventListener('error', onError);
            probe.pause();
            probe.removeAttribute('src');
            probe.load();
        };
    }, [directKind, enabled, previewKind, retryVersion, src]);

    return {
        kind: directKind ?? (previewKind === 'media' ? kind : null),
        status: directKind ? 'resolved' : previewKind === 'media' ? status : 'idle',
        retry,
    };
};
