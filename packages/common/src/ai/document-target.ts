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

/** Whether two page ids name the same page (ids arrive stringified or as numbers). */
export const isSamePage = (
    a: string | number | null | undefined,
    b: string | number | null | undefined,
): boolean => a !== null && a !== undefined && b !== null && b !== undefined && String(a) === String(b)