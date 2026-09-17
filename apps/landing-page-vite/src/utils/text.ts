/**
 * Drop a trailing arrow glyph from a CMS/translation label so it does not
 * double up with an icon we render next to it. Keeps ops free to write the
 * label with or without the arrow.
 */
export function stripTrailingArrow(value: string): string {
    return value.replace(/\s*(?:→|➔|›|»|->)\s*$/, "").trim();
}
