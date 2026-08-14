import { Extension, Mark, mergeAttributes } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import type { Node as PMNode } from '@tiptap/pm/model'
import { ChangeSet } from 'prosemirror-changeset'

export const changeTrackerPluginKey = new PluginKey('changeTracker')

// ─── Suggestion mark ─────────────────────────────────────────────────
// Tracked insertions / deletions live IN the document as this mark (Google
// Docs style) instead of being recomputed from a diff baseline. Accept/reject
// simply manipulates the mark, so there is no baseline or offset mapping to
// drift out of sync.
export const SuggestionMark = Mark.create({
    name: 'suggestion',
    inclusive: false,

    addAttributes() {
        return {
            type: {
                default: 'insert',
                parseHTML: element => element.getAttribute('data-suggestion') || 'insert',
                renderHTML: attributes => ({ 'data-suggestion': attributes.type }),
            },
        }
    },

    parseHTML() {
        return [{ tag: 'span[data-suggestion]' }]
    },

    renderHTML({ HTMLAttributes }) {
        const type = HTMLAttributes['data-suggestion'] === 'delete' ? 'delete' : 'insert'
        return ['span', mergeAttributes(HTMLAttributes, {
            class: type === 'delete' ? 'kn-suggestion-delete' : 'kn-suggestion-insert',
        }), 0]
    },
})

// ─── Types ───────────────────────────────────────────────────────────
export type SuggestionType = 'insert' | 'delete'

export interface TrackedSuggestion {
    type: SuggestionType
    from: number
    to: number
    text: string
}

export interface TrackerSelection {
    type: SuggestionType
    from: number
    to: number
}

export interface ChangeTrackerStorage {
    /** Whether new edits are being turned into suggestions. */
    enabled: boolean
    /** Contiguous suggestion ranges in document order. */
    suggestions: TrackedSuggestion[]
    /** Bumped on every mutation so React consumers can subscribe. */
    version: number
    /** The suggestion the user clicked, if any. */
    selected: TrackerSelection | null
    start: () => void
    stop: () => void
    accept: (from: number, to: number, type: SuggestionType) => void
    reject: (from: number, to: number, type: SuggestionType) => void
    acceptAll: () => void
    rejectAll: () => void
    select: (sel: TrackerSelection | null) => void
    acceptSelection: () => void
    rejectSelection: () => void
    subscribe: (cb: () => void) => () => void
}

// ─── Helpers ─────────────────────────────────────────────────────────
const suggestionMarkType = (doc: PMNode) => doc.type.schema.marks.suggestion

/** Scan the doc for contiguous runs of the suggestion mark. */
export const findSuggestionRanges = (doc: PMNode): TrackedSuggestion[] => {
    const markType = suggestionMarkType(doc)
    if (!markType) return []
    const ranges: TrackedSuggestion[] = []
    let cur: { type: SuggestionType; from: number; to: number } | null = null
    const flush = () => {
        if (cur) {
            ranges.push({ ...cur, text: doc.textBetween(cur.from, cur.to, ' ') })
            cur = null
        }
    }
    doc.descendants((node, pos) => {
        if (!node.isText) return true
        const mark = node.marks.find(m => m.type === markType)
        if (mark) {
            const type: SuggestionType = mark.attrs.type === 'delete' ? 'delete' : 'insert'
            const from = pos
            const to = pos + node.nodeSize
            if (cur && cur.type === type && cur.to === from) {
                cur.to = to
            } else {
                flush()
                cur = { type, from, to }
            }
        } else {
            flush()
        }
        return true
    })
    flush()
    return ranges
}

// ─── Extension ───────────────────────────────────────────────────────
export const ChangeTracker = Extension.create<Record<string, never>, ChangeTrackerStorage>({
    name: 'changeTracker',

    addExtensions() {
        return [SuggestionMark]
    },

    addStorage() {
        return {
            enabled: false,
            suggestions: [],
            version: 0,
            selected: null,
            start: () => {},
            stop: () => {},
            accept: () => {},
            reject: () => {},
            acceptAll: () => {},
            rejectAll: () => {},
            select: () => {},
            acceptSelection: () => {},
            rejectSelection: () => {},
            subscribe: () => () => {},
        }
    },

    onCreate() {
        const editor = this.editor
        const storage = this.storage
        const listeners = new Set<() => void>()

        const notify = () => {
            storage.version++
            listeners.forEach(cb => cb())
        }
        const refresh = () => {
            storage.suggestions = findSuggestionRanges(editor.state.doc)
        }

        storage.subscribe = (cb: () => void) => {
            listeners.add(cb)
            return () => listeners.delete(cb)
        }

        storage.start = () => {
            if (storage.enabled) return
            storage.enabled = true
            refresh()
            notify()
        }

        storage.stop = () => {
            if (!storage.enabled) return
            storage.enabled = false
            notify()
        }

        const markType = () => editor.schema.marks.suggestion

        /** Apply accept/reject for a single suggestion range. */
        const applyOne = (from: number, to: number, type: SuggestionType, accept: boolean) => {
            const tr = editor.state.tr
            tr.setMeta(changeTrackerPluginKey, true)
            if (type === 'delete') {
                // accept deletion → actually remove the struck text
                // reject deletion → keep the text, drop the mark
                if (accept) tr.delete(from, to)
                else tr.removeMark(from, to, markType())
            } else {
                // accept insertion → keep the text, drop the mark
                // reject insertion → remove the text
                if (accept) tr.removeMark(from, to, markType())
                else tr.delete(from, to)
            }
            if (storage.selected && storage.selected.from === from && storage.selected.to === to) {
                storage.selected = null
            }
            editor.view.dispatch(tr)
        }

        storage.accept = (from, to, type) => applyOne(from, to, type, true)
        storage.reject = (from, to, type) => applyOne(from, to, type, false)

        /** Apply accept/reject to every suggestion in one transaction. */
        const applyAll = (accept: boolean) => {
            const tr = editor.state.tr
            tr.setMeta(changeTrackerPluginKey, true)
            // Reverse order keeps earlier positions valid as ranges are deleted.
            for (const s of [...storage.suggestions].reverse()) {
                if (s.type === 'delete') {
                    if (accept) tr.delete(s.from, s.to)
                    else tr.removeMark(s.from, s.to, markType())
                } else {
                    if (accept) tr.removeMark(s.from, s.to, markType())
                    else tr.delete(s.from, s.to)
                }
            }
            storage.selected = null
            if (tr.steps.length) editor.view.dispatch(tr)
        }

        storage.acceptAll = () => applyAll(true)
        storage.rejectAll = () => applyAll(false)

        storage.select = sel => {
            storage.selected = sel
            notify()
        }
        storage.acceptSelection = () => {
            const sel = storage.selected
            if (!sel) return
            storage.accept(sel.from, sel.to, sel.type)
        }
        storage.rejectSelection = () => {
            const sel = storage.selected
            if (!sel) return
            storage.reject(sel.from, sel.to, sel.type)
        }

        editor.on('update', () => {
            refresh()
            notify()
        })
    },

    addProseMirrorPlugins() {
        const storage = this.storage

        return [
            new Plugin({
                key: changeTrackerPluginKey,

                // Turn ordinary edits into suggestion marks. Runs once per
                // dispatch; the produced transaction carries our meta so the
                // next appendTransaction round skips it.
                appendTransaction(transactions, oldState, newState) {
                    if (!storage.enabled) return null
                    if (transactions.some(t => t.getMeta(changeTrackerPluginKey))) return null

                    let changeset = ChangeSet.create(oldState.doc)
                    for (const tr of transactions) {
                        if (tr.mapping.maps.length > 0) {
                            changeset = changeset.addSteps(tr.doc, tr.mapping.maps, null)
                        }
                    }
                    const changes = changeset.changes
                    if (changes.length === 0) return null

                    const markType = suggestionMarkType(newState.doc)
                    if (!markType) return null

                    const tr = newState.tr
                    tr.setMeta(changeTrackerPluginKey, true)

                    // Process from the end backwards so re-inserting a deletion
                    // never shifts the positions of ranges that come before it.
                    for (let i = changes.length - 1; i >= 0; i--) {
                        const ch = changes[i]
                        const deletedLen = ch.toA - ch.fromA
                        const insertedLen = ch.toB - ch.fromB

                        // Deleted inline text: put it back, marked as deletion.
                        if (deletedLen > 0) {
                            const $a = oldState.doc.resolve(ch.fromA)
                            const $b = oldState.doc.resolve(ch.toA)
                            if ($a.sameParent($b) && $a.parent.isTextblock) {
                                tr.insert(ch.fromB, oldState.doc.slice(ch.fromA, ch.toA).content)
                                tr.addMark(ch.fromB, ch.fromB + deletedLen, markType.create({ type: 'delete' }))
                            }
                        }

                        // Inserted inline text: mark it as insertion.
                        if (insertedLen > 0) {
                            const from = ch.fromB + deletedLen
                            const to = ch.toB + deletedLen
                            if (from < to) {
                                const $f = tr.doc.resolve(from)
                                const $t = tr.doc.resolve(to)
                                if ($f.sameParent($t) && $f.parent.isTextblock) {
                                    tr.addMark(from, to, markType.create({ type: 'insert' }))
                                }
                            }
                        }
                    }

                    return tr.steps.length > 0 ? tr : null
                },

                props: {
                    handleClick(view, pos, event) {
                        if (!storage.enabled || storage.suggestions.length === 0) return false
                        const target = event.target as HTMLElement | null
                        const el = target?.closest?.('[data-suggestion]') as HTMLElement | null
                        if (el) {
                            const type: SuggestionType =
                                el.getAttribute('data-suggestion') === 'delete' ? 'delete' : 'insert'
                            const hit = findSuggestionRanges(view.state.doc).find(
                                r => r.type === type && pos >= r.from && pos < r.to,
                            )
                            if (hit) storage.select({ type: hit.type, from: hit.from, to: hit.to })
                            return false
                        }
                        if (storage.selected) storage.select(null)
                        return false
                    },
                    handleKeyDown(_view, event) {
                        if (!storage.enabled || !storage.selected) return false
                        if (event.key === 'Escape') {
                            storage.select(null)
                            return true
                        }
                        return false
                    },
                },
            }),
        ]
    },
})

export default ChangeTracker
