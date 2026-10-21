/**
 * Host-owned confirmation prompts (SSH host grants, raw sockets, opening the
 * system browser).
 *
 * The main process is the only place allowed to *ask*: the user answers in a
 * dedicated, frameless window that runs the app's UI kit, instead of a native
 * `dialog.showMessageBox`. That window is a separate webContents (see
 * `main/confirm/index.ts`), so renderer plugins — which share the main window's
 * JS realm — cannot observe or answer a prompt on the user's behalf.
 *
 * These types are shared between the main process and the confirmation
 * renderer entry (`src/renderer/src/confirm.tsx`); keep them dependency-free.
 */

export type ConfirmKind = 'ssh' | 'network' | 'browser'

export interface ConfirmRow {
    /** Locale-resolved label, e.g. "主机密钥". */
    label: string
    /** Locale-resolved value; long values wrap. */
    value: string
    /** Highlight destructive capabilities (e.g. an interactive shell). */
    tone?: 'default' | 'muted' | 'danger'
}

/** Everything the confirmation window needs to render one prompt. */
export interface ConfirmRequestPayload {
    /** Correlates the answer with the pending main-process request. */
    id: string
    kind: ConfirmKind
    title: string
    /** One-line reason, e.g. "A plugin wants to connect to root@host:22 over SSH". */
    message: string
    rows: ConfirmRow[]
    /** Secondary explanation shown under the rows (consequences/remembering). */
    note?: string
    allowLabel: string
    denyLabel: string
}

/** What callers hand to `askConfirmation`; the id is assigned by the host. */
export type ConfirmRequest = Omit<ConfirmRequestPayload, 'id'>
