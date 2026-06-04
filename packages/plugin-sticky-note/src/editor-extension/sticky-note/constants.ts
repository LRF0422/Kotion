/**
 * Sticky note color presets.
 * Each preset has a Post-it style background and a slightly darker border accent.
 * Light/dark variants ensure the note remains legible in both themes.
 */
export interface StickyNoteColor {
    name: string;
    label: string;
    /** Card background + border (the margin sticky-note card itself) */
    light: { bg: string; border: string };
    dark: { bg: string; border: string };
    /** Inline highlight tint applied to the marked text in the document */
    highlight: { light: string; dark: string };
}

export const STICKY_NOTE_COLORS: StickyNoteColor[] = [
    {
        name: "yellow",
        label: "Yellow",
        light: { bg: "#FFF8B8", border: "#F5C518" },
        dark: { bg: "#5C4A14", border: "#C9A227" },
        highlight: { light: "rgb(255 212 0 / 0.18)", dark: "rgb(255 212 0 / 0.22)" }
    },
    {
        name: "pink",
        label: "Pink",
        light: { bg: "#FFD6E0", border: "#F06292" },
        dark: { bg: "#5C2A38", border: "#C2185B" },
        highlight: { light: "rgb(240 98 146 / 0.18)", dark: "rgb(240 98 146 / 0.28)" }
    },
    {
        name: "blue",
        label: "Blue",
        light: { bg: "#CFE8FF", border: "#4A90E2" },
        dark: { bg: "#1F3A5F", border: "#3F7BBF" },
        highlight: { light: "rgb(74 144 226 / 0.18)", dark: "rgb(74 144 226 / 0.28)" }
    },
    {
        name: "green",
        label: "Green",
        light: { bg: "#D4F1C5", border: "#7CB342" },
        dark: { bg: "#284a1f", border: "#5d9d3a" },
        highlight: { light: "rgb(124 179 66 / 0.20)", dark: "rgb(124 179 66 / 0.30)" }
    },
    {
        name: "purple",
        label: "Purple",
        light: { bg: "#E5D4F1", border: "#9C6ADE" },
        dark: { bg: "#3D2A52", border: "#7E57C2" },
        highlight: { light: "rgb(156 106 222 / 0.18)", dark: "rgb(156 106 222 / 0.30)" }
    },
    {
        name: "orange",
        label: "Orange",
        light: { bg: "#FFE0B5", border: "#F39C12" },
        dark: { bg: "#5C3A14", border: "#D88A1F" },
        highlight: { light: "rgb(243 156 18 / 0.20)", dark: "rgb(243 156 18 / 0.30)" }
    }
];

export const DEFAULT_STICKY_NOTE_COLOR = "yellow";

export const findStickyNoteColor = (name: string): StickyNoteColor => {
    return STICKY_NOTE_COLORS.find((c) => c.name === name) || STICKY_NOTE_COLORS[0];
};
