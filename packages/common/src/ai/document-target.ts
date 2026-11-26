/**
 * Document-target vocabulary shared by the tool-binding layer and host
 * surfaces.
 *
 * The rule these helpers encode is the one that used to be missing: a document
 * tool is bound to a PAGE, never to "whatever editor happened to be active".
 * When the conversation's target page and the editor the tool would close over
 * are different pages, executing the tool is a silent write to the wrong
 * document. The caller must instead resolve/acquire the target editor, or fail
 * with an actionable error the model can react to.
 */

export interface DocumentTargetPage {
    pageId: string
    title?: string
    spaceId?: string
}

/** Human label for diagnostics; never empty. */
export const documentTargetLabel = (page: DocumentTargetPage): string =>
    page.title && page.title.trim() ? `「${page.title.trim()}」` : page.pageId

/** No target at all: the run has never acquired a document. */
export const noDocumentTargetMessage = (): string =>
    '当前会话还没有编辑目标，无法执行文档工具。'
    + '请先调用 createPage 新建页面，或调用 editPage(pageId) 把已有页面设为编辑目标，再重试这次操作。'

/** A target exists but no live editor can be obtained for it. */
export const documentTargetUnavailableMessage = (
    page: DocumentTargetPage,
    cause?: unknown,
): string => {
    const reason = cause instanceof Error
        ? cause.message
        : typeof cause === 'string' && cause.trim()
            ? cause
            : ''
    return `无法取得编辑目标 ${documentTargetLabel(page)} 的编辑器`
        + (reason ? `：${reason}` : '')
        + '。为避免把内容写到别的页面，本次文档操作已停止。'
        + '请稍后重试，或重新调用 editPage 切换目标；不要改用当前页面重试。'
}

/**
 * A target exists but is not a document page at all: its whole surface is a
 * plugin component (a canvas, a mind-map board, a table view, …).
 *
 * This is NOT a transient failure, so the message must not invite a retry —
 * that is exactly what produced the "切换编辑目标失败 / 请稍后重试" loop on a page
 * whose editor can never be acquired. It names the page type, says the write
 * was stopped, and points at the only working routes.
 */
export const componentPageTargetMessage = (
    page: DocumentTargetPage,
    options?: { pageTypeLabel?: string; pageTypeId?: string },
): string => {
    const label = options?.pageTypeLabel?.trim()
    const id = options?.pageTypeId?.trim()
    const kind = label || id ? `「${label || id}」类型的` : ''
    return `页面${documentTargetLabel(page)}是${kind}整页组件页面：整页由插件组件渲染，没有可编辑的文档正文，`
        + '文档工具无法读取或修改它。这不是加载中的暂时状态，重试 editPage 或文档工具都不会成功，'
        + '也不要把内容写到用户当前打开的页面。'
        + '请改用该页面类型插件提供的工具；如果插件没有提供工具，请告诉用户在该页面里直接编辑。'
}

/** The page declares a page type whose plugin is not active, so nothing can render it. */
export const missingPageTypeTargetMessage = (
    page: DocumentTargetPage,
    pageTypeId?: string,
): string => {
    const id = pageTypeId?.trim()
    return `页面${documentTargetLabel(page)}的页面类型${id ? `（${id}）` : ''}所属插件当前未启用，无法取得它的编辑器。`
        + '这不是暂时故障，重试 editPage 不会成功，也不要把内容写到别的页面。'
        + '请先让用户确认该插件已安装并启用，或在启用后重新打开这个页面。'
}

/** Whether two page ids name the same page (ids arrive stringified or as numbers). */
export const isSamePage = (
    a: string | number | null | undefined,
    b: string | number | null | undefined,
): boolean => a !== null && a !== undefined && b !== null && b !== undefined && String(a) === String(b)