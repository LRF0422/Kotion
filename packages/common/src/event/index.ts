import { EventEmitter } from "./event";


export const event = new EventEmitter()


// --- Typed event names ---

/** Emitted when the plugin set changes (install, uninstall, update, init, refresh) */
export const PLUGIN_CHANGED = "PLUGIN_CHANGED"

/** Emitted after Layout successfully initializes plugins from the server */
export const PLUGIN_INIT_SUCCESS = "PLUGIN_INIT_SUCCESS"

/** Emitted when a plugin is skipped because its apiVersion major differs from the host's */
export const PLUGIN_INCOMPATIBLE = "PLUGIN_INCOMPATIBLE"

export const ON_PAGE_REFRESH = "ON_PAGE_REFRESH"

export const ON_FAVORITE_CHANGE = "ON_FAVORITE_CHANGE"

export const ON_MESSAGE = "ON_MESSAGE"

export const GO_TO_MARKETPLACE = "GO_TO_MARKETPLACE"

export const TOGGLE_AI_ASSISTANT = "TOGGLE_AI_ASSISTANT"

/**
 * Toggle a side-dock panel by its id. Payload: `{ id, position? }`.
 * Handled by the dock host; no-op when no dock is mounted (see `dockRuntime`).
 */
export const TOGGLE_DOCK_PANEL = "TOGGLE_DOCK_PANEL"

/** Imperatively start a tour by its id. Payload: the tour id string. */
export const START_TOUR = "START_TOUR"

export const BUSINESS_TOPIC = {
    PAGE_COOPERATION_INVITE: "space.page.cooperation.invite"
}
