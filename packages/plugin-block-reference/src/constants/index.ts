/**
 * Constants for Block Reference Plugin
 * @module @kn/plugin-block-reference/constants
 */

/** Plugin name identifier */
export const PLUGIN_NAME = 'blockReference';

/** Debounce delay for search operations (milliseconds) */
export const DEBOUNCE_DELAY = 500;

/** Cache time-to-live (milliseconds) - 5 minutes */
export const CACHE_TTL = 5 * 60 * 1000;

/** Maximum cache size (number of items) */
export const CACHE_MAX_SIZE = 100;

/** Keyboard shortcuts configuration */
export const KEYBOARD_SHORTCUTS = {
    CLOSE_SELECTOR: ['Escape'],
    SELECT_ITEM: ['Enter'],
    NAVIGATE_UP: ['ArrowUp'],
    NAVIGATE_DOWN: ['ArrowDown'],
} as const;

/** Node type names */
export const NODE_NAMES = {
    BLOCK_REFERENCE: 'BlockReference',
    PAGE_REFERENCE: 'PageReference',
} as const;

/** Reference type constants */
export const REFERENCE_TYPES = {
    /** Reference to a child page */
    CHILD: 'CHILD',
    /** Reference to a sibling page */
    BROTHER: 'BROTHER',
    /** Reference to any existing page */
    LINK: 'LINK',
} as const;

/** Selector popup dimensions */
export const SELECTOR_DIMENSIONS = {
    BLOCK_SELECTOR_WIDTH: 400,
    PAGE_SELECTOR_WIDTH: 300,
    SCROLL_HEIGHT: 300,
} as const;

/** Z-index values */
export const Z_INDEX = {
    SELECTOR_POPUP: 1000,
    HOVER_CONTROLS: 50,
} as const;
