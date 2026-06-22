import { Attributes } from "@tiptap/core";

/**
 * Theme-aware color object stored on a cell attribute.
 * Mirrors the shape produced by `createThemeAwareColor` from @kn/ui.
 */
interface ThemeAwareColor {
  base: string;
  light: string;
  dark: string;
}

type CellColorValue = string | ThemeAwareColor | null;

/**
 * Build the renderHTML output for a theme-aware color attribute.
 *
 * Tiptap's `mergeAttributes` concatenates multiple `style` strings, so each
 * visual attribute can safely contribute its own `style` fragment. The
 * theme-aware object is also persisted to a data attribute so it round-trips
 * through parseHTML.
 *
 * @param value - The stored color (legacy string or theme-aware object)
 * @param cssProp - The CSS property to emit (e.g. `background-color`, `color`)
 * @param cssVar - CSS custom property prefix for the theme variants
 * @param dataAttr - The data attribute used to persist the theme-aware object
 */
const renderColor = (
  value: CellColorValue,
  cssProp: string,
  cssVar: string,
  dataAttr: string
): Record<string, string> => {
  if (!value) {
    return {};
  }

  // Simple color string - use as is (backward compatibility)
  if (typeof value === "string") {
    return { style: `${cssProp}: ${value}` };
  }

  // Theme-aware color object: emit CSS custom properties + a light default.
  // The `theme-adaptive-cell` class lets the stylesheet swap to the dark
  // variant under the dark theme.
  return {
    style: `--${cssVar}-light: ${value.light}; --${cssVar}-dark: ${value.dark}; ${cssProp}: var(--${cssVar}-light);`,
    class: "theme-adaptive-cell",
    [dataAttr]: JSON.stringify(value)
  };
};

/**
 * Parse a theme-aware color attribute from a DOM element.
 *
 * @param element - The cell element
 * @param inlineValue - The inline CSS value (fallback for legacy content)
 * @param dataAttr - The data attribute holding the theme-aware object
 */
const parseColor = (
  element: HTMLElement,
  inlineValue: string,
  dataAttr: string
): CellColorValue => {
  if (!inlineValue) return null;

  const themeData = element.getAttribute(dataAttr);
  if (themeData) {
    try {
      return JSON.parse(themeData) as ThemeAwareColor;
    } catch {
      // Fall back to the simple inline color string
    }
  }

  return inlineValue;
};

/**
 * Shared attribute definitions for `tableCell` and `tableHeader`.
 *
 * Beyond the standard table cell attributes (colspan/rowspan/colwidth/style),
 * this adds presentation attributes used by the cell formatting toolbar:
 * - `backgroundColor` / `color` - theme-aware fill and text color
 * - `textAlign` - horizontal alignment
 * - `verticalAlign` - vertical alignment
 *
 * Keeping these in one place avoids drift between the two cell node types.
 */
export const commonCellAttributes: Attributes = {
  colspan: {
    default: 1,
    parseHTML: element => {
      const colspan = element.getAttribute("colspan");
      return colspan ? parseInt(colspan, 10) : 1;
    }
  },
  rowspan: {
    default: 1,
    parseHTML: element => {
      const rowspan = element.getAttribute("rowspan");
      return rowspan ? parseInt(rowspan, 10) : 1;
    }
  },
  colwidth: {
    default: null,
    parseHTML: element => {
      const colwidth = element.getAttribute("colwidth");
      return colwidth ? [parseInt(colwidth, 10)] : null;
    }
  },
  style: {
    default: null
  },
  textAlign: {
    default: null,
    parseHTML: element => element.style.textAlign || null,
    renderHTML: attributes =>
      attributes.textAlign
        ? { style: `text-align: ${attributes.textAlign}` }
        : {}
  },
  verticalAlign: {
    default: null,
    parseHTML: element => element.style.verticalAlign || null,
    renderHTML: attributes =>
      attributes.verticalAlign
        ? { style: `vertical-align: ${attributes.verticalAlign}` }
        : {}
  },
  backgroundColor: {
    default: null,
    parseHTML: element =>
      parseColor(element, element.style.backgroundColor, "data-bg-color-theme"),
    renderHTML: attributes =>
      renderColor(
        attributes.backgroundColor,
        "background-color",
        "bg-color",
        "data-bg-color-theme"
      )
  },
  color: {
    default: null,
    parseHTML: element =>
      parseColor(element, element.style.color, "data-color-theme"),
    renderHTML: attributes =>
      renderColor(attributes.color, "color", "text-color", "data-color-theme")
  }
};
