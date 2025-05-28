export * from "./editor"
export * from "yjs"
export { TiptapCollabProvider, HocuspocusProvider } from "@hocuspocus/provider"
export { useEditor, useReactNodeView, EditorContent, type NodeViewProps, NodeViewWrapper, NodeViewContent, type NodeViewRenderer, ReactNodeViewRenderer } from "@tiptap/react"

declare module '@tiptap/core' {
}
