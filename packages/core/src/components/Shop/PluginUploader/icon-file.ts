/**
 * Icon file picking + validation, shared by the two publish surfaces.
 *
 * The submit wizard used to own these helpers privately; the "publish a new
 * version" dialog needs exactly the same rules (a version may rebrand the
 * plugin), so they live here instead of being copied.
 *
 * The thrown messages are i18n KEYS (`iconType` / `iconSize` / `iconSquare` /
 * `iconDimensions`), resolved by the caller as
 * `pluginUploader.validation.<key>`.
 */

/** Open the OS image picker; resolves null when the user cancels. */
export const pickImageFile = () =>
  new Promise<File | null>((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/png,image/jpeg'
    input.onchange = () => resolve(input.files?.[0] ?? null)
    input.addEventListener('cancel', () => resolve(null))
    input.click()
  })

/** Marketplace icons: PNG/JPEG, ≤2 MB, square, at least 120×120. */
export const validateIcon = async (file: File) => {
  if (!['image/png', 'image/jpeg'].includes(file.type)) throw new Error('iconType')
  if (file.size > 2 * 1024 * 1024) throw new Error('iconSize')

  const url = URL.createObjectURL(file)
  try {
    const dimensions = await new Promise<{ width: number; height: number }>((resolve, reject) => {
      const image = new Image()
      image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight })
      image.onerror = reject
      image.src = url
    })
    if (dimensions.width !== dimensions.height) throw new Error('iconSquare')
    if (dimensions.width < 120 || dimensions.height < 120) throw new Error('iconDimensions')
  } finally {
    URL.revokeObjectURL(url)
  }
}
