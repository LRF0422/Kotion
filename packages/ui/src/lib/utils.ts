// @ts-nocheck
import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatBytes(
  bytes: number,
  opts: {
    decimals?: number
    sizeType?: "accurate" | "normal"
  } = {}
) {
  const { decimals = 0, sizeType = "normal" } = opts

  const sizes = ["Bytes", "KB", "MB", "GB", "TB"]
  const accurateSizes = ["Bytes", "KiB", "MiB", "GiB", "TiB"]
  if (bytes === 0) return "0 Byte"
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, i)).toFixed(decimals)} ${sizeType === "accurate" ? accurateSizes[i] ?? "Bytest" : sizes[i] ?? "Bytes"
    }`
}

/**
 * Parse color string to RGB values
 */
function parseColor(color: string): { r: number; g: number; b: number; a: number } | null {
  // Handle hex colors
  if (color.startsWith('#')) {
    const hex = color.slice(1);
    let r: number, g: number, b: number, a = 1;

    if (hex.length === 3) {
      r = parseInt(hex[0] + hex[0], 16);
      g = parseInt(hex[1] + hex[1], 16);
      b = parseInt(hex[2] + hex[2], 16);
    } else if (hex.length === 6) {
      r = parseInt(hex.slice(0, 2), 16);
      g = parseInt(hex.slice(2, 4), 16);
      b = parseInt(hex.slice(4, 6), 16);
    } else if (hex.length === 8) {
      r = parseInt(hex.slice(0, 2), 16);
      g = parseInt(hex.slice(2, 4), 16);
      b = parseInt(hex.slice(4, 6), 16);
      a = parseInt(hex.slice(6, 8), 16) / 255;
    } else {
      return null;
    }

    return { r, g, b, a };
  }

  // Handle rgb/rgba colors
  const rgbMatch = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
  if (rgbMatch) {
    return {
      r: parseInt(rgbMatch[1] as string),
      g: parseInt(rgbMatch[2] as string),
      b: parseInt(rgbMatch[3] as string),
      a: rgbMatch[4] ? parseFloat(rgbMatch[4] as string) : 1
    };
  }

  return null;
}

/**
 * Convert RGB to HSL
 */
function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  r /= 255;
  g /= 255;
  b /= 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / d + 2) / 6;
        break;
      case b:
        h = ((r - g) / d + 4) / 6;
        break;
    }
  }

  return { h: h * 360, s, l };
}

/**
 * Convert HSL to RGB
 */
function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  h /= 360;

  let r: number, g: number, b: number;

  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };

    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }

  return {
    r: Math.round(r * 255),
    g: Math.round(g * 255),
    b: Math.round(b * 255)
  };
}

/**
 * Adapt color for theme mode by adjusting lightness
 * @param color - Original color string (hex, rgb, rgba)
 * @param targetTheme - Target theme ('light' or 'dark')
 * @returns Adapted color string
 */
export function adaptColorForTheme(color: string, targetTheme: 'light' | 'dark'): string {
  // Handle gradients - don't modify them
  if (color.includes('gradient')) {
    return color;
  }

  // Handle image URLs - don't modify them
  if (color.includes('url(')) {
    return color;
  }

  const parsed = parseColor(color);
  if (!parsed) return color;

  const { r, g, b, a } = parsed;
  const hsl = rgbToHsl(r, g, b);

  // Adjust lightness based on theme
  let adjustedL = hsl.l;

  if (targetTheme === 'dark') {
    // For dark mode: darken bright colors, keep dark colors
    if (hsl.l > 0.5) {
      // Bright colors: reduce lightness significantly
      adjustedL = hsl.l * 0.4; // Darken to 40% of original
    } else if (hsl.l > 0.3) {
      // Medium colors: reduce lightness moderately
      adjustedL = hsl.l * 0.6;
    }
    // Dark colors (l <= 0.3): keep as is or slightly adjust
    adjustedL = Math.max(0.1, adjustedL); // Ensure minimum visibility
  } else {
    // For light mode: lighten dark colors, keep light colors
    if (hsl.l < 0.3) {
      // Dark colors: increase lightness significantly
      adjustedL = 0.3 + (hsl.l * 1.5); // Lighten dark colors
    } else if (hsl.l < 0.5) {
      // Medium colors: increase lightness moderately
      adjustedL = hsl.l * 1.3;
    }
    // Light colors (l >= 0.5): keep as is or slightly adjust
    adjustedL = Math.min(0.9, adjustedL); // Ensure it's not pure white
  }

  // Slightly adjust saturation for better visibility
  let adjustedS = hsl.s;
  if (targetTheme === 'dark') {
    // In dark mode, slightly increase saturation for better contrast
    adjustedS = Math.min(1, hsl.s * 1.1);
  } else {
    // In light mode, slightly decrease saturation to avoid harsh colors
    adjustedS = hsl.s * 0.95;
  }

  const rgb = hslToRgb(hsl.h, adjustedS, adjustedL);

  // Return rgba format to preserve alpha
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${a})`;
}

/**
 * Store color with theme variants
 * @param baseColor - The original selected color
 * @returns Object with light and dark variants
 */
export function createThemeAwareColor(baseColor: string): {
  base: string;
  light: string;
  dark: string;
} {
  return {
    base: baseColor,
    light: adaptColorForTheme(baseColor, 'light'),
    dark: adaptColorForTheme(baseColor, 'dark')
  };
}

/**
 * Get the appropriate color for current theme
 * @param colorData - Can be a simple color string or theme-aware color object
 * @param currentTheme - Current theme ('light' or 'dark')
 * @returns Color string for current theme
 */
export function getColorForTheme(
  colorData: string | { base: string; light: string; dark: string },
  currentTheme: 'light' | 'dark' | string | undefined
): string {
  if (typeof colorData === 'string') {
    // Legacy color format - adapt on the fly
    return adaptColorForTheme(colorData, currentTheme === 'dark' ? 'dark' : 'light');
  }

  // Theme-aware color object
  return currentTheme === 'dark' ? colorData.dark : colorData.light;
}

