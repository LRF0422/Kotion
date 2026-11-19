/**
 * Page-title safety.
 *
 * The page title is not an ordinary block: the schema is `title block*`, so the
 * `title` container is pinned first and its child `heading` is the only editable
 * part. That makes the title structurally different from body content in two
 * ways the AI tools kept getting wrong:
 *
 *  - **It cannot be deleted or replaced as a block.** Removing/replacing the
 *    `title` node leaves a document that does not match the schema (the write
 *    either fails confusingly or the page loses its title, icon and cover); the
 *    inner heading cannot be deleted either, because the container requires it.
 *  - **It must be edited as literal text.** Title text is a page name, not
 *    markup: feeding it through an HTML/Markdown parser decodes entities in
 *    `R&D`, drops any `<...>` fragment, and turns a newline into new blocks that
 *    do not fit inside a heading.
 *
 * Every mutating tool therefore asks this module before touching a position or
 * a block, and `updateTitle` is the one operation allowed to write the heading.
 */

/** Guidance reused by every tool that refuses to mutate the title. */
export const TITLE_EDIT_HINT =
    '页面标题是文档第一个受保护块，请用 updateTitle 修改；不要用删除、替换、插入、移动或转换类工具改标题。'

export interface TitleBoundary {
    /** The title node is pinned at document position 0. */
    from: 0
    /** End of the title container; any position below this is the title. */
    to: number
}

type DocLike = {
    firstChild?: { type: { name: string }; nodeSize: number } | null
}

/**
 * Range of the leading title container, or null for a document that has no
 * title (legacy/imported content). Positions after the title are exactly
 * `>= boundary.to`.
 */
export function titleBoundary(doc: DocLike): TitleBoundary | null {
    const first = doc.firstChild
    if (!first || first.type.name !== 'title') return null
    return { from: 0, to: first.nodeSize }
}

/**
 * A page title is a single line of literal text. Collapsing whitespace also
 * keeps a model-provided title with embedded newlines from being interpreted as
 * "title + a paragraph", which the heading cannot contain.
 */
export function normalizeDocumentTitle(raw: string): string {
    return raw.replace(/\s+/g, ' ').trim()
}

type TitleEditorLike = {
    state: {
        doc: DocLike & {
            firstChild?: {
                type: { name: string }
                nodeSize: number
                firstChild?: {
                    type: { name: string }
                    content: { size: number }
                    textContent: string
                } | null
            } | null
        }
        tr: { replaceWith: (from: number, to: number, content: any) => unknown }
    }
    view: { dispatch: (tr: any) => void }
    schema: {
        text: (text: string) => any
        nodes: { heading?: { create: (attrs: Record<string, unknown>, content?: any) => any } }
    }
}

export type ApplyDocumentTitleResult =
    | { success: true; previousTitle: string; newTitle: string; changed: boolean }
    | { success: false; error: string }

/**
 * Replace the title's heading CONTENT with a literal text node.
 *
 * Deliberately not `insertContent(newTitle)`: that parses HTML/Markdown and can
 * produce block nodes (`<p>`) that the `title > heading` schema rejects, which
 * is why retries looked like "the title changes but never becomes right". Only
 * the heading content is replaced, so the title container (and its icon /
 * cover / tags / fullWidth attrs) survives untouched.
 */
export function applyDocumentTitle(editor: TitleEditorLike, rawTitle: string): ApplyDocumentTitleResult {
    const newTitle = normalizeDocumentTitle(rawTitle)
    if (!newTitle) return { success: false, error: '标题不能为空' }
    if (!editor?.state?.doc) return { success: false, error: '当前没有可编辑的文档，无法更新标题' }

    const title = editor.state.doc.firstChild
    if (!title || title.type.name !== 'title') {
        return { success: false, error: '当前文档没有标题块，无法更新标题（请刷新页面后重试）' }
    }

    const heading = title.firstChild
    if (!heading || heading.type.name !== 'heading') {
        // Malformed title (legacy/imported doc): rebuild the required heading
        // instead of failing forever or leaving the page untitled.
        const headingType = editor.schema.nodes.heading
        if (!headingType) return { success: false, error: '当前编辑器不支持标题节点' }
        const rebuilt = headingType.create({ level: 1 }, editor.schema.text(newTitle))
        const tr = editor.state.tr
        tr.replaceWith(title.nodeSize - 1, title.nodeSize - 1, rebuilt)
        editor.view.dispatch(tr)
        return { success: true, previousTitle: '', newTitle, changed: true }
    }

    const previousTitle = heading.textContent
    if (previousTitle === newTitle) {
        return { success: true, previousTitle, newTitle, changed: false }
    }

    // doc(0) + title(1) + heading(1) = content start, exactly like the document
    // schema. `content.size` (not textContent.length) keeps inline atoms from
    // shortening the range and leaving stale text behind.
    const contentFrom = 2
    const contentTo = contentFrom + heading.content.size
    const tr = editor.state.tr
    tr.replaceWith(contentFrom, contentTo, editor.schema.text(newTitle))
    editor.view.dispatch(tr)

    return { success: true, previousTitle, newTitle, changed: true }
}

/** Narrow a Tiptap editor to the surface `applyDocumentTitle` needs. */
export const asTitleEditor = (editor: unknown): TitleEditorLike => editor as TitleEditorLike