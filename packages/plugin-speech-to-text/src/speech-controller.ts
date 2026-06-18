import { useSyncExternalStore } from 'react';
import { toast } from '@kn/ui';
import { Editor } from '@kn/editor';

export type SpeechStatus = 'idle' | 'recording' | 'paused';

export interface SpeechState {
    status: SpeechStatus;
    /** Elapsed recording seconds (does not advance while paused). */
    duration: number;
    /** Live (non-final) transcript, shown in the toast and not yet inserted. */
    interim: string;
    error: string | null;
}

const SUPPORTED =
    typeof window !== 'undefined' &&
    ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);

/** Errors that resolve themselves on the next auto-restart — never toasted. */
const BENIGN_ERRORS = new Set(['aborted', 'no-speech', 'network']);
/** Errors that mean recognition cannot continue this session. */
const FATAL_ERRORS = new Set(['not-allowed', 'service-not-allowed', 'audio-capture']);

function mapError(code: string): string {
    switch (code) {
        case 'audio-capture':
            return '未检测到麦克风，请确认设备已连接。';
        case 'not-allowed':
        case 'service-not-allowed':
            return '麦克风权限被拒绝，请在浏览器设置中允许访问。';
        default:
            return `语音识别出错：${code}`;
    }
}

/**
 * Single source of truth for the simple speech-to-text feature.
 *
 * The Web Speech API has no real "pause", and Chrome ends recognition on its
 * own after silence/timeouts. This controller papers over both: pause()/resume()
 * stop and restart the recognizer, and an unexpected `onend` while we still
 * intend to record triggers an auto-restart so dictation keeps running.
 *
 * Final results are inserted at the editor's *current* selection, so the user
 * can pause, click elsewhere in the doc, then resume to continue at the new spot.
 */
class SpeechController {
    readonly isSupported = SUPPORTED;

    private recognition: any = null;
    private editor: Editor | null = null;
    private lang = 'en-US';
    /** Intended mode — drives the auto-restart decision in onEnd(). */
    private mode: SpeechStatus = 'idle';
    private durationTimer: ReturnType<typeof setInterval> | null = null;
    /** Pending auto-restart after an unexpected end, debounced to avoid hot loops. */
    private restartTimer: ReturnType<typeof setTimeout> | null = null;
    /**
     * Live-dictation region in the doc: the not-yet-final transcript is written
     * between [liveFrom, liveTo] and rewritten on every interim update so text
     * streams in word-by-word. `null` liveFrom means "anchor at the caret on the
     * next write" (set on start/resume so dictation follows the cursor).
     */
    private liveFrom: number | null = null;
    private liveTo = 0;
    private listeners = new Set<() => void>();
    private state: SpeechState = { status: 'idle', duration: 0, interim: '', error: null };

    getState = (): SpeechState => this.state;

    subscribe = (cb: () => void): (() => void) => {
        this.listeners.add(cb);
        return () => {
            this.listeners.delete(cb);
        };
    };

    getLang = (): string => this.lang;

    private emit(patch: Partial<SpeechState>) {
        this.state = { ...this.state, ...patch };
        this.listeners.forEach((l) => l());
    }

    private startTimer() {
        this.stopTimer();
        this.durationTimer = setInterval(() => {
            this.emit({ duration: this.state.duration + 1 });
        }, 1000);
    }

    private stopTimer() {
        if (this.durationTimer) {
            clearInterval(this.durationTimer);
            this.durationTimer = null;
        }
    }

    private clearRestart() {
        if (this.restartTimer) {
            clearTimeout(this.restartTimer);
            this.restartTimer = null;
        }
    }

    private ensureRecognition() {
        if (this.recognition) return this.recognition;
        const SpeechRecognition =
            (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.maxAlternatives = 1;
        recognition.onresult = (e: any) => this.onResult(e);
        recognition.onerror = (e: any) => this.onError(e);
        recognition.onend = () => this.onEnd();
        this.recognition = recognition;
        return recognition;
    }

    /** Start (or restart) the underlying recognizer, swallowing "already started". */
    private safeStart() {
        const recognition = this.ensureRecognition();
        try {
            recognition.lang = this.lang;
            recognition.start();
        } catch (_) {
            /* InvalidStateError when already running — ignore */
        }
    }

    private safeStop() {
        try {
            this.recognition?.stop();
        } catch (_) {
            /* ignore */
        }
    }

    /** Forget the live region so the next write anchors at the current caret. */
    private resetLive() {
        this.liveFrom = null;
        this.liveTo = 0;
    }

    /** Ensure liveFrom/liveTo point somewhere; default to the current caret. */
    private ensureAnchor(): boolean {
        if (!this.editor) return false;
        if (this.liveFrom == null) {
            const pos = this.editor.state.selection.to;
            this.liveFrom = pos;
            this.liveTo = pos;
        }
        return true;
    }

    /** Replace the live region with `text` (transient interim transcript). */
    private writeLive(text: string) {
        if (!this.ensureAnchor()) return;
        const from = this.liveFrom!;
        try {
            if (text) {
                this.editor!.chain().insertContentAt({ from, to: this.liveTo }, text).run();
                this.liveTo = from + text.length;
            } else if (this.liveTo > from) {
                this.editor!.chain().deleteRange({ from, to: this.liveTo }).run();
                this.liveTo = from;
            }
        } catch (_) {
            // Positions went stale (doc changed under us) — re-anchor next time.
            this.resetLive();
        }
    }

    /** Commit a finalized segment permanently and advance the anchor past it. */
    private commit(text: string) {
        const trimmed = text.trim();
        if (!trimmed) {
            this.writeLive('');
            return;
        }
        if (!this.ensureAnchor()) return;
        const from = this.liveFrom!;
        const out = trimmed + ' ';
        try {
            this.editor!
                .chain()
                .insertContentAt({ from, to: this.liveTo }, out)
                .setTextSelection(from + out.length)
                .run();
            const end = from + out.length;
            this.liveFrom = end;
            this.liveTo = end;
        } catch (_) {
            this.resetLive();
        }
    }

    private onResult(event: any) {
        let interim = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
            const result = event.results[i];
            const text: string = result[0]?.transcript ?? '';
            if (result.isFinal) {
                // Replaces the current interim region with the final text and
                // moves the anchor past it.
                this.commit(text);
            } else {
                interim += text;
            }
        }
        // Stream the trailing interim into the doc so text appears as spoken.
        this.writeLive(interim);
        if (interim !== this.state.interim) {
            this.emit({ interim });
        }
    }

    private onError(event: any) {
        const code = event?.error;
        // Chrome fires `network` (and `no-speech`/`aborted`) spuriously during
        // continuous recognition even while it keeps producing results. Toasting
        // each one — combined with auto-restart — spams the screen, so we stay
        // silent and let onEnd's debounced restart recover.
        if (BENIGN_ERRORS.has(code)) return;

        const message = mapError(code);
        this.emit({ error: message });
        toast.error(message);

        // Permission / device errors are unrecoverable for this session.
        if (FATAL_ERRORS.has(code)) {
            this.stop();
        }
    }

    private onEnd() {
        // Recognizer stopped. If we still intend to be recording, it ended on
        // its own (silence/timeout/transient network) — restart to stay
        // continuous, but debounce so a failing recognizer can't hot-loop.
        if (this.mode === 'recording') {
            this.clearRestart();
            this.restartTimer = setTimeout(() => {
                this.restartTimer = null;
                if (this.mode === 'recording') this.safeStart();
            }, 400);
            return;
        }
        // paused / idle: state already reflects it; just clear interim.
        if (this.state.interim) this.emit({ interim: '' });
    }

    start = (editor: Editor, lang?: string) => {
        if (!this.isSupported) {
            toast.error('此浏览器不支持语音识别，请使用 Chrome 或 Edge。');
            return;
        }
        this.editor = editor;
        if (lang) this.lang = lang;
        if (this.mode !== 'idle') return; // already running
        this.mode = 'recording';
        this.resetLive();
        this.emit({ status: 'recording', duration: 0, interim: '', error: null });
        this.startTimer();
        this.safeStart();
    };

    pause = () => {
        if (this.mode !== 'recording') return;
        this.mode = 'paused';
        this.emit({ status: 'paused', interim: '' });
        this.stopTimer();
        this.clearRestart();
        this.safeStop();
    };

    resume = () => {
        if (this.mode !== 'paused') return;
        this.mode = 'recording';
        // Re-anchor so dictation continues wherever the caret is now (the user
        // may have clicked to a new spot while paused).
        this.resetLive();
        this.emit({ status: 'recording', error: null });
        this.startTimer();
        this.safeStart();
    };

    stop = () => {
        if (this.mode === 'idle') return;
        this.mode = 'idle';
        this.stopTimer();
        this.clearRestart();
        this.resetLive();
        this.emit({ status: 'idle', interim: '' });
        this.safeStop();
    };

    setLang = (lang: string) => {
        if (lang === this.lang) return;
        this.lang = lang;
        // Apply immediately by bouncing the recognizer; onEnd will restart it
        // with the new language because mode is still 'recording'.
        if (this.mode === 'recording') {
            this.safeStop();
        }
    };
}

export const speechController = new SpeechController();

export interface UseSpeechController extends SpeechState {
    isSupported: boolean;
    lang: string;
    start: (editor: Editor, lang?: string) => void;
    pause: () => void;
    resume: () => void;
    stop: () => void;
    setLang: (lang: string) => void;
}

export function useSpeechController(): UseSpeechController {
    const state = useSyncExternalStore(
        speechController.subscribe,
        speechController.getState,
        speechController.getState
    );
    return {
        ...state,
        isSupported: speechController.isSupported,
        lang: speechController.getLang(),
        start: speechController.start,
        pause: speechController.pause,
        resume: speechController.resume,
        stop: speechController.stop,
        setLang: speechController.setLang,
    };
}
