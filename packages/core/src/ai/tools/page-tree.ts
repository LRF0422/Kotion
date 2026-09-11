/**
 * Pure helpers for the AI page-tree tools.
 *
 * Kept dependency-free (no @kn/common / @kn/editor imports) so the placement
 * and flattening rules can be unit-checked with a plain tsc + node run — see
 * page-tree.check.ts. The service-backed tool wiring lives in page-tools.ts.
 */

/** A page-tree node as returned by SpacePageService.pages.getPageTree. */
export interface PageTreeInputNode {
    id?: unknown
    title?: unknown
    pageType?: unknown
    parentId?: unknown
    children?: PageTreeInputNode[] | null
    childCount?: unknown
    hasChildren?: unknown
}

/** Compact, model-friendly view of one page in the tree. */
export interface FlatPageNode {
    pageId: string
    title: string
    parentId: string | null
    depth: number
    pageType?: string
    hasChildren: boolean
    childCount?: number
}

/** Normalize an id-ish value to a trimmed string; null when unusable. */
export function toPageId(value: unknown): string | null {
    if (typeof value === 'string') {
        const trimmed = value.trim()
        return trimmed.length > 0 ? trimmed : null
    }
    if (typeof value === 'number' && Number.isFinite(value) && Number.isInteger(value)) {
        return String(value)
    }
    if (typeof value === 'bigint') return value.toString()
    return null
}

/**
 * Depth-first flatten of the (possibly nested) page tree, preserving sibling
 * order. Children may arrive either nested under `children` or absent with a
 * `childCount`/hasChildren hint.
 */
export function flattenPageTree(
    nodes: PageTreeInputNode[] | null | undefined,
    options: { depth?: number; parentId?: string | null } = {},
): FlatPageNode[] {
    const depth = options.depth ?? 0
    const explicitParent = options.parentId ?? null
    const out: FlatPageNode[] = []
    if (!Array.isArray(nodes)) return out

    for (const node of nodes) {
        const pageId = toPageId(node?.id)
        if (!pageId) continue
        const parentId = toPageId(node?.parentId) ?? explicitParent
        const children = Array.isArray(node?.children) ? node!.children! : undefined
        const childCountRaw = node?.childCount
        const childCount = typeof childCountRaw === 'number' && Number.isFinite(childCountRaw)
            ? childCountRaw
            : children?.length
        const pageType = typeof node?.pageType === 'string' && node.pageType ? node.pageType : undefined
        out.push({
            pageId,
            title: typeof node?.title === 'string' ? node.title : '',
            parentId,
            depth,
            pageType,
            hasChildren: Boolean(children && children.length > 0) || node?.hasChildren === true || (childCount ?? 0) > 0,
            childCount,
        })
        if (children && children.length > 0) {
            out.push(...flattenPageTree(children, { depth: depth + 1, parentId: pageId }))
        }
    }
    return out
}

/** Indented text rendering of a flattened tree; capped to keep prompts small. */
export function formatPageTree(
    flat: FlatPageNode[],
    options: { maxNodes?: number } = {},
): { text: string; truncated: boolean } {
    const maxNodes = options.maxNodes ?? 200
    const slice = flat.slice(0, maxNodes)
    const text = slice
        .map(node => `${'  '.repeat(Math.max(0, node.depth))}- ${node.title || '(未命名)'} [${node.pageId}]${node.hasChildren ? ' …' : ''}`)
        .join('\n')
    return { text, truncated: flat.length > maxNodes }
}

export type CreatePosition = 'child' | 'sibling' | 'root'

export interface CreatePlacementInput {
    /** Placement relative to `relativeTo`: a child, a sibling, or the space root. */
    position?: CreatePosition
    /** The page the new page is placed relative to. */
    relativeTo?: string | null
    /** Explicit parent id (null = top level). Wins over position/relativeTo. */
    parentId?: string | null
    /** Legacy shorthand: create under the active page. */
    asSubPage?: boolean
    /** Active edit page (session target, else the open page). */
    currentPageId?: string | null
    /** Parent of `relativeTo`, required to create a sibling. */
    relativeParentId?: string | null
}

export interface CreatePlacement {
    parentId: string | null
    /** Human-readable summary of where the page will land. */
    description: string
}

/**
 * Resolve the parent a new page should be created under.
 *
 * Precedence: explicit `parentId` > `position` relative to `relativeTo` >
 * legacy `asSubPage` under the active page > space root.
 */
export function resolveCreatePlacement(input: CreatePlacementInput): CreatePlacement {
    const relativeTo = toPageId(input.relativeTo)
    const currentPageId = toPageId(input.currentPageId)

    if (input.parentId !== undefined) {
        const parentId = toPageId(input.parentId)
        return {
            parentId,
            description: parentId ? `作为页面 ${parentId} 的子页面` : '创建在空间根层级',
        }
    }

    if (relativeTo && input.position === 'sibling') {
        const parentId = toPageId(input.relativeParentId)
        return {
            parentId,
            description: parentId
                ? `作为页面 ${relativeTo} 的同级页面（父页面 ${parentId}）`
                : `作为页面 ${relativeTo} 的同级页面（根层级）`,
        }
    }

    if (relativeTo && (input.position === 'child' || input.position === undefined)) {
        return { parentId: relativeTo, description: `作为页面 ${relativeTo} 的子页面` }
    }

    if (input.position === 'child' && currentPageId) {
        return { parentId: currentPageId, description: `作为当前页面 ${currentPageId} 的子页面` }
    }

    if (input.parentId === undefined && input.asSubPage && currentPageId) {
        return { parentId: currentPageId, description: `作为当前页面 ${currentPageId} 的子页面` }
    }

    return { parentId: null, description: '创建在空间根层级' }
}
