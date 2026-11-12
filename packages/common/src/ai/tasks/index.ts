/**
 * Task output monitoring — the engine that turns one log source's incremental
 * output into a small number of events, plus its React bindings and the host
 * bridge adapters.
 *
 * Pure logic (`task-monitor.ts`) is host-seam driven: the reader, the persistence
 * and the clock are injected, so the engine never imports a desktop API.
 * `monitor-readers.ts` is the adapter from the host's `dev.logsSince` /
 * `task.logsSince` bridges; `use-task-monitor.ts` is the only React-aware file.
 */

export * from './task-monitor'
export * from './monitor-readers'
export * from './use-task-monitor'