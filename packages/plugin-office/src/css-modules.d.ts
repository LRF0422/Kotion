/**
 * The grid library ships plain CSS, imported for its side effects only.
 * Declared here because this package compiles without Vite's client types.
 */
declare module '*.css' {
    const content: string
    export default content
}
