import { resolveOptionalService, type FileService, type SelectedFile } from '@kn/common'

/** Guard against accidentally importing files we cannot parse in the browser. */
const MAX_FILE_SIZE = 64 * 1024 * 1024 // 64 MB
const ACCEPTED_EXTENSIONS = ['.xlsx', '.xlsm', '.xls', '.csv']
const ACCEPTED_MIME_TYPES = [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel.sheet.macroEnabled.12',
    'application/vnd.ms-excel',
    'text/csv',
]

export interface PickedExcelFile {
    file: File | null
    /** Set when the user picked a file we refuse to parse. */
    error?: string
}

/**
 * Open the OS file picker and resolve with the chosen Excel/CSV file.
 *
 * Resolves with `null` when the user cancels. The `cancel` event is not
 * universally supported, so a window-focus fallback resolves the promise as
 * well — otherwise a cancelled dialog leaks the promise forever.
 *
 * @deprecated prefer {@link pickExcelFile} when you want validation feedback.
 */
export function triggerExcelFileImport(): Promise<File | null> {
    return pickExcelFile().then((result) => result.file)
}

export function pickExcelFile(): Promise<PickedExcelFile> {
    return new Promise((resolve) => {
        const input = document.createElement('input')
        input.type = 'file'
        input.accept = ACCEPTED_EXTENSIONS.join(',')
        input.style.display = 'none'
        document.body.appendChild(input)

        let settled = false
        const cleanup = () => {
            window.removeEventListener('focus', handleFocus)
            input.remove()
        }
        const finish = (result: PickedExcelFile) => {
            if (settled) return
            settled = true
            cleanup()
            resolve(result)
        }

        // Chrome/Edge/Safari fire `cancel`; Firefox does not, hence the focus
        // fallback below.
        input.addEventListener('cancel', () => finish({ file: null }))

        // Fallback: the picker closes and the window regains focus. Give the
        // `change`/`cancel` events a moment to land first.
        const handleFocus = () => {
            setTimeout(() => {
                const file = input.files?.[0] ?? null
                finish(validate(file))
            }, 400)
        }

        input.onchange = () => {
            const file = input.files?.[0] ?? null
            finish(validate(file))
        }

        window.addEventListener('focus', handleFocus, { once: true })
        input.click()
    })
}

/**
 * Pick an Excel/CSV file from the in-app File Manager (File Center).
 *
 * The File Manager plugin exposes `openFileSelector`; the selected record is
 * then read through the authenticated download API, so no OS file dialog is
 * involved. Falls back to {@link pickExcelFile} when the File Manager is not
 * installed, so importing still works standalone.
 */
export async function pickExcelFileFromCenter(editor?: unknown): Promise<PickedExcelFile> {
    const fileService = resolveOptionalService('fileService')
    if (!fileService?.openFileSelector) return pickExcelFile()

    let selected: SelectedFile[] | null = null
    try {
        selected = await fileService.openFileSelector(
            { multiple: false, target: 'file', accept: ACCEPTED_MIME_TYPES, title: '选择 Excel 文件' },
            editor,
        )
    } catch (error) {
        return { file: null, error: errorMessage(error, '打开文件管理器失败') }
    }

    const chosen = (selected ?? []).find((entry) => entry && !entry.isFolder)
    if (!chosen) return { file: null }

    try {
        const blob = await readFileCenterBlob(fileService, chosen)
        if (!blob) return { file: null, error: '无法读取文件「' + chosen.name + '」' }
        const file = new File([blob], chosen.name, { type: blob.type || mimeTypeFor(chosen.name) })
        return validate(file)
    } catch (error) {
        return { file: null, error: errorMessage(error, '读取文件「' + chosen.name + '」失败') }
    }
}

/** Prefer the authenticated download API; fall back to the record's direct URL. */
async function readFileCenterBlob(fileService: FileService, chosen: SelectedFile): Promise<Blob | null> {
    if (chosen.id && fileService.getFileBlob) {
        try {
            return await fileService.getFileBlob(chosen.id)
        } catch {
            // Fall through to the direct URL below.
        }
    }
    if (chosen.url) {
        const response = await fetch(chosen.url)
        if (response.ok) return await response.blob()
    }
    return null
}

function mimeTypeFor(name: string): string {
    const lower = name.toLowerCase()
    if (lower.endsWith('.csv')) return 'text/csv'
    if (lower.endsWith('.xls')) return 'application/vnd.ms-excel'
    return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
}

function errorMessage(error: unknown, fallback: string): string {
    return error instanceof Error && error.message ? error.message : fallback
}

function validate(file: File | null): PickedExcelFile {
    if (!file) return { file: null }

    const lower = file.name.toLowerCase()
    const extensionOk = ACCEPTED_EXTENSIONS.some((ext) => lower.endsWith(ext))
    if (!extensionOk) {
        return { file: null, error: '不支持的文件类型：' + file.name + '，请选择 .xlsx / .xls / .csv 文件' }
    }
    if (file.size === 0) {
        return { file: null, error: '文件为空：' + file.name }
    }
    if (file.size > MAX_FILE_SIZE) {
        return { file: null, error: '文件过大（' + (file.size / 1024 / 1024).toFixed(1) + 'MB），上限 64MB' }
    }
    return { file }
}
