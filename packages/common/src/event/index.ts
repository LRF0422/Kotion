import { EventEmitter } from "./event";


export const event = new EventEmitter()


// --- Typed event names ---

/** Emitted when the plugin set changes (install, uninstall, update, init, refresh) */
export const PLUGIN_CHANGED = "PLUGIN_CHANGED"

/** Emitted after Layout successfully initializes plugins from the server */
export const PLUGIN_INIT_SUCCESS = "PLUGIN_INIT_SUCCESS"

export const ON_PAGE_REFRESH = "ON_PAGE_REFRESH"

export const ON_FAVORITE_CHANGE = "ON_FAVORITE_CHANGE"

export const ON_MESSAGE = "ON_MESSAGE"

export const GO_TO_MARKETPLACE = "GO_TO_MARKETPLACE"

export const TOGGLE_AI_ASSISTANT = "TOGGLE_AI_ASSISTANT"

export const BUSINESS_TOPIC = {
    PAGE_COOPERATION_INVITE: "space.page.cooperation.invite"
}

// --- Backward-compatible aliases ---
// These are kept so existing code that imports REFRESH_PLUSINS still compiles.
// New code should use PLUGIN_CHANGED instead.

/** @deprecated Use PLUGIN_CHANGED instead */
export const REFRESH_PLUSINS = PLUGIN_CHANGED
