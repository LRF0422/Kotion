/**
 * Desktop (Electron) capability bridge contract — backwards-compatible entry.
 *
 * The declarations were split into `./desktop/*` by capability family. This
 * file re-exports the whole surface so existing imports (and `@kn/common`'s
 * root barrel) keep working; prefer importing the domain module directly.
 */

export * from './desktop'
