/**
 * Every reason the plugin set can change.
 *
 * `refresh` is deliberately the odd one out: it means "re-read what is already
 * here" — the marketplace reloading its own list, or a plugin announcing that it
 * finished registering itself — and never changes the server's installed set.
 * See `REMOTE_PLUGIN_CHANGE_SOURCES` in this module.
 */
export type PluginChangeSource =
  | 'install'
  | 'uninstall'
  | 'update'
  | 'init'
  | 'refresh'
  | 'enable'
  | 'disable'
  | 'delete'
  | 'bulk'

/**
 * Type-safe event map.
 * Each key is an event name; the value is the payload type (undefined for no payload).
 */
export interface EventMap {
  PLUGIN_CHANGED: { source: PluginChangeSource }
  PLUGIN_INIT_SUCCESS: undefined
  PLUGIN_INCOMPATIBLE: { name: string; apiVersion?: string }
  ON_MESSAGE: any
  GO_TO_MARKETPLACE: undefined
  TOGGLE_AI_ASSISTANT: undefined
  TOGGLE_DOCK_PANEL: { id: string; position?: 'right' | 'left' }
  DOCK_PANEL_RUNNING: { id: string; running: boolean }
  START_TOUR: string
}

type EventKey = keyof EventMap

/**
 * Type-safe EventEmitter.
 * Generic enough to support both typed and untyped (string) event names
 * for backward compatibility.
 */
export class EventEmitter<T extends string = EventKey> {
  public callbacks: { [key: string]: Function[] } = {};

  public on<K extends T>(
    event: K,
    fn: K extends keyof EventMap ? (payload: EventMap[K]) => void : Function
  ): this {
    if (!this.callbacks[event as string]) {
      this.callbacks[event as string] = [];
    }
    this.callbacks[event as string] = [...this.callbacks[event as string], fn as Function];
    return this;
  }

  public emit<K extends T>(
    event: K,
    ...args: K extends keyof EventMap
      ? EventMap[K] extends undefined
      ? []
      : [EventMap[K]]
      : any[]
  ): this {
    console.log('emit event => ', event);
    const callbacks = this.callbacks[event as string];
    if (callbacks) {
      callbacks.forEach((callback) => callback.apply(this, args));
    }
    return this;
  }

  public off<K extends T>(
    event: K,
    fn?: K extends keyof EventMap ? (payload: EventMap[K]) => void : Function
  ): this {
    const callbacks = this.callbacks[event as string];
    if (callbacks) {
      if (fn) {
        this.callbacks[event as string] = callbacks.filter((callback) => callback !== fn);
      } else {
        delete this.callbacks[event as string];
      }
    }
    return this;
  }

  destroy(): void {
    this.callbacks = {};
  }
}
