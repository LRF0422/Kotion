#!/usr/bin/env node
/**
 * agent-cache-report — explain a DSH session's prompt-cache hit rate.
 *
 * Reads a session's durable event log (`.zstd` or plain `.jsonl`) and reports,
 * per turn and per step, how many prompt tokens were billed uncached versus
 * served from the provider's prefix cache.
 *
 * The percentages here are the SAME ones the GUI shows: the usage pill renders
 * `cacheReadTokens / (uncachedInputTokens + cacheReadTokens + cacheWriteTokens)`
 * over the whole durable log, and `total = billed input + output`. Both figures
 * are cumulative, so a young session always reads low — that is a measurement
 * artifact, not a caching regression.
 *
 * Usage:
 *   node scripts/agent-cache-report.mjs <session-dir-or-file> [...]
 *   node scripts/agent-cache-report.mjs --all          # every session in ~/.dsh
 *   node scripts/agent-cache-report.mjs --json <path>  # machine-readable
 */

import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, join } from 'node:path'

/** Prompt-side buckets are disjoint; output is billed separately. */
function billedInput(u) {
    return (u.inputTokens ?? 0) + (u.cacheReadTokens ?? 0) + (u.cacheWriteTokens ?? 0)
}

function pct(hit, total) {
    return total > 0 ? (hit / total) * 100 : null
}

function fmt(n) {
    return n.toLocaleString('en-US')
}

/** Read one session log, transparently decompressing zstd. */
function readEventLines(path) {
    let raw
    if (path.endsWith('.zstd')) {
        raw = execFileSync('zstd', ['-dc', path], { maxBuffer: 1 << 30 }).toString('utf8')
    } else {
        raw = readFileSync(path, 'utf8')
    }
    return raw.split('\n').filter(Boolean)
}

function parseSession(path) {
    const events = []
    for (const line of readEventLines(path)) {
        try {
            events.push(JSON.parse(line))
        } catch {
            /* a truncated tail line is not fatal */
        }
    }

    const header = events.find((e) => e.type === 'session')
    const steps = []
    const seen = new Set()
    /** Events that rewrite or truncate the request prefix — each can break caching. */
    const prefixEvents = []

    for (const e of events) {
        const d = e.data ?? {}
        if (e.type === 'assistant/message' && d.usage) {
            const key = `${d.turn}/${d.step}`
            if (seen.has(key)) continue
            seen.add(key)
            steps.push({ turn: d.turn, step: d.step, time: e.time, usage: d.usage })
        } else if (e.type === 'request/context') {
            prefixEvents.push({ type: 'route/systemPromptUpdate change', seq: e.seq })
        } else if (e.type === 'system/message') {
            prefixEvents.push({ type: 'system prompt (re)write', seq: e.seq })
        } else if (typeof e.type === 'string' && /compact|prune|inject|recall/i.test(e.type)) {
            prefixEvents.push({ type: e.type, seq: e.seq })
        }
    }

    return {
        id: header?.id ?? basename(path).replace(/\.jsonl.*$/, ''),
        cwd: header?.cwd ?? null,
        agentPreset: header?.agentPreset ?? null,
        path,
        steps,
        prefixEvents,
    }
}

function analyze(session) {
    const byTurn = new Map()
    let cumIn = 0
    let cumRead = 0
    let cumWrite = 0
    let cumOut = 0

    for (const s of session.steps) {
        const u = s.usage
        const inTok = u.inputTokens ?? 0
        const read = u.cacheReadTokens ?? 0
        const write = u.cacheWriteTokens ?? 0
        const out = u.outputTokens ?? 0

        const t = byTurn.get(s.turn) ?? { turn: s.turn, steps: 0, in: 0, read: 0, write: 0, out: 0, firstStepHit: null }
        t.steps += 1
        t.in += inTok
        t.read += read
        t.write += write
        t.out += out
        const stepBilled = inTok + read + write
        if (t.firstStepHit === null) t.firstStepHit = pct(read, stepBilled)
        byTurn.set(s.turn, t)

        cumIn += inTok
        cumRead += read
        cumWrite += write
        cumOut += out
    }

    const billed = cumIn + cumRead + cumWrite
    return {
        byTurn: [...byTurn.values()],
        totals: {
            uncachedInputTokens: cumIn,
            cacheReadTokens: cumRead,
            cacheWriteTokens: cumWrite,
            outputTokens: cumOut,
            billedInputTokens: billed,
            /** Exactly what the GUI pill shows. */
            cacheHitPercent: pct(cumRead, billed),
            totalTokens: billed + cumOut,
        },
    }
}

function report(session) {
    const { byTurn, totals } = analyze(session)
    const lines = []
    lines.push(`session ${session.id}`)
    if (session.cwd) lines.push(`  cwd        ${session.cwd}`)
    if (session.agentPreset) lines.push(`  preset     ${session.agentPreset}`)
    lines.push(`  steps      ${session.steps.length}`)

    if (session.steps.length === 0) {
        lines.push('  (no usage recorded yet)')
        return lines.join('\n')
    }

    lines.push('')
    lines.push('  turn  steps   uncachedIn    cacheRead    cacheWrite      output   hit%   firstStepHit%')
    for (const t of byTurn) {
        const b = t.in + t.read + t.write
        lines.push(
            `  ${String(t.turn).padStart(4)}  ${String(t.steps).padStart(5)}  ` +
                `${fmt(t.in).padStart(12)}  ${fmt(t.read).padStart(12)}  ${fmt(t.write).padStart(12)}  ` +
                `${fmt(t.out).padStart(11)}  ${(pct(t.read, b) ?? 0).toFixed(1).padStart(5)}  ` +
                `${(t.firstStepHit ?? 0).toFixed(1).padStart(12)}`
        )
    }

    lines.push('')
    lines.push(
        `  TOTAL billed input ${fmt(totals.billedInputTokens)} ` +
            `(uncached ${fmt(totals.uncachedInputTokens)} + cache read ${fmt(totals.cacheReadTokens)} + write ${fmt(totals.cacheWriteTokens)})`
    )
    lines.push(`  TOTAL output       ${fmt(totals.outputTokens)}`)
    lines.push(
        `  GUI pill shows     ${totals.cacheHitPercent === null ? 'n/a' : totals.cacheHitPercent.toFixed(1) + '%'} ` +
            `cache hit · ${(totals.totalTokens / 1000).toFixed(1)}k tokens`
    )

    if (session.prefixEvents.length > 1) {
        lines.push('')
        lines.push(`  prefix-affecting events: ${session.prefixEvents.length}`)
        const counts = new Map()
        for (const e of session.prefixEvents) counts.set(e.type, (counts.get(e.type) ?? 0) + 1)
        for (const [type, n] of counts) lines.push(`    ${String(n).padStart(4)}  ${type}`)
    }

    return lines.join('\n')
}

function findSessionLogs(dir) {
    const out = []
    const walk = (d, depth) => {
        if (depth > 4) return
        for (const entry of readdirSync(d, { withFileTypes: true })) {
            const p = join(d, entry.name)
            if (entry.isDirectory()) walk(p, depth + 1)
            else if (/^session.*\.jsonl(\.zstd)?$/.test(entry.name)) out.push(p)
        }
    }
    walk(dir, 0)
    return out.sort()
}

function main() {
    const argv = process.argv.slice(2)
    const asJson = argv.includes('--json')
    const args = argv.filter((a) => a !== '--json')

    let targets = []
    if (args.length === 0 || args.includes('--all')) {
        targets = findSessionLogs(join(homedir(), '.dsh', 'sessions'))
    } else {
        for (const a of args) {
            const st = statSync(a)
            targets.push(...(st.isDirectory() ? findSessionLogs(a) : [a]))
        }
    }

    if (targets.length === 0) {
        console.error('no session logs found')
        process.exit(1)
    }

    if (asJson) {
        console.log(
            JSON.stringify(
                targets.map((p) => {
                    const s = parseSession(p)
                    return { ...s, ...analyze(s) }
                }),
                null,
                2
            )
        )
        return
    }

    const blocks = targets.map((p) => report(parseSession(p)))
    console.log(blocks.join('\n\n'))

    const all = targets.map((p) => analyze(parseSession(p)))
    const inTok = all.reduce((a, x) => a + x.totals.uncachedInputTokens, 0)
    const read = all.reduce((a, x) => a + x.totals.cacheReadTokens, 0)
    const write = all.reduce((a, x) => a + x.totals.cacheWriteTokens, 0)
    if (targets.length > 1) {
        console.log('\n' + '='.repeat(72))
        console.log(
            `ACROSS ${targets.length} SESSIONS: cache read ${fmt(read)} / billed input ${fmt(inTok + read + write)} = ` +
                `${(pct(read, inTok + read + write) ?? 0).toFixed(1)}%`
        )
    }
}

main()
