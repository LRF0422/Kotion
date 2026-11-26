import type { ComponentType, ReactNode } from "react"
import type {
    PageDocumentContent,
    PageRecord,
    SharedPage,
} from "../domain/space-page/contracts"
import type { PageId, SpaceId } from "../domain/space-page/ids"

/** Host render context for a contributed page type. */
export type PageRenderMode = "edit" | "view" | "share" | (string & {})

/** Page values a direct renderer may receive in authenticated or shared views. */
export type PageRendererPage = PageRecord | SharedPage

export interface PageRendererProps {
    page: PageRendererPage
    pageId: PageId
    spaceId: SpaceId
    active: boolean
    readOnly: boolean
    mode: PageRenderMode
}

export interface PageInitialDocumentContext {
    /** Stable namespaced page-type id being created. */
    pageType: string
    title: string
    /** Application language active when the page is created. */
    locale?: string
    spaceId: SpaceId
    /** Available when a host creates the document after allocating the page id. */
    pageId?: PageId
}

export type PageInitialDocumentFactory = (
    context: PageInitialDocumentContext,
) => PageDocumentContent

/** Render the complete page with a plugin-owned React component. */
export interface DirectPageRenderer {
    type: "component"
    component: ComponentType<PageRendererProps>
}

/**
 * Render through the standard editor using a document containing one
 * plugin-owned NodeView-backed page component.
 */
export interface EditorComponentPageRenderer {
    type: "editor-component"
    createInitialDocument: PageInitialDocumentFactory
}

export type PageTypeRenderer = DirectPageRenderer | EditorComponentPageRenderer

/** Stable page-type contribution declared through PluginConfig.pageTypes. */
export interface PageTypeConfig {
    /** Stable namespaced id, for example `acme:canvas`. */
    id: string
    label: string
    description?: string
    icon?: ReactNode
    /** Ascending display order. Defaults to 100. */
    order?: number
    defaultTitle?: string
    /** Whether the host may resolve this renderer for a public share. */
    publicShare?: boolean
    renderer: PageTypeRenderer
}

/** A validated page type returned by PluginManager.resolvePageTypes(). */
export interface ResolvedPageType extends PageTypeConfig {
    source: "plugin" | "core"
    owner: string
}

/** The shape both `PageTypeConfig` and `ResolvedPageType` satisfy. */
type PageTypeRendererLike = { renderer?: { type?: string } } | null | undefined

/**
 * A page type whose whole surface is a plugin React component.
 *
 * Such a page has a title — and whatever the component draws — but **no
 * document body**: there is no editor for a document tool to bind to, and the
 * off-screen editing engine cannot mount one. Consumers that need a document
 * (agent document tools, the off-screen engine, the floating editor) must say
 * so instead of waiting for an editor that will never appear.
 */
export const isComponentPageType = (pageType: PageTypeRendererLike): boolean =>
    pageType?.renderer?.type === "component"

/**
 * A page type that IS a normal collaborative document: the plugin only seeds
 * the document (`createInitialDocument`) or renders one node inside it, so
 * `pageType` being set does not make the page non-editable.
 *
 * `undefined` (no page type) is the plain-document case and is *not* covered
 * here — callers decide that themselves.
 */
export const isDocumentPageType = (pageType: PageTypeRendererLike): boolean =>
    pageType?.renderer?.type === "editor-component"
