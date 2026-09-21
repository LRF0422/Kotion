/** Guard against accidentally importing files we cannot parse in the browser. */
const MAX_FILE_SIZE = 64 * 1024 * 1024 // 64 MB
const ACCEPTED_EXTENSIONS = ['.xlsx', '.xlsm', '.xls', '.csv']

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

function validate(file: File | null): PickedExcelFile {
    if (!file) return { file: null }

    const lower = file.name.toLowerCase()
    const extensionOk = ACCEPTED_EXTENSIONS.some((ext) => lower.endsWith(ext))
    if (!extensionOk) {
        return { file: null, error: `不支持的文件类型：${file.name}，请选择 .xlsx / .xls / .csv 文件` }
    }
    if (file.size === 0) {
        return { file: null, error: `文件为空：${file.name}` }
    }
    if (file.size > MAX_FILE_SIZE) {
        return { file: null, error: `文件过大（${(file.size / 1024 / 1024).toFixed(1)}MB），上限 64MB` }
    }
    return { file }
}
