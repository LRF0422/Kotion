import { useEffect, useRef, useState } from 'react'

/**
 * The awareness field the session host announces itself in, and the value it
 * announces.
 *
 * Exported as constants because two different files have to agree on them: the
 * editor that publishes the role, and this hook that reads it. A silent
 * disagreement here does not fail loudly — it just means no collaborator ever
 * sees a host, so the grace countdown runs on every page and everyone is told
 * the host left.
 */
export const HOST_AWARENESS_FIELD = 'role'
export const HOST_AWARENESS_HOST = 'host'

/**
 * The slice of a Yjs awareness instance this hook needs, declared structurally
 * so the editor package does not have to agree with the caller on a provider
 * type.
 */
export interface AwarenessLike {
  /** This client's own awareness id, so its own entry can be excluded. */
  clientID: number
  getStates(): Map<number, Record<string, any>>
  on(event: 'change', handler: () => void): void
  off(event: 'change', handler: () => void): void
}

export interface UseHostPresenceReturn {
  /** True while some *other* client is announcing itself as the session host. */
  hostPresent: boolean
  /**
   * Whether a host has been seen at least once since this awareness instance
   * was attached. Absence only means departure after a presence: awareness is
   * empty for a moment after connecting, and treating that as "the host left"
   * would put every collaborator into the waiting state as it opens the page.
   */
  hostSeen: boolean
}

/**
 * Watch awareness for the presence of the page's session host.
 *
 * This is the fast half of host-departure detection: Hocuspocus removes a
 * client's awareness entry as soon as its connection goes, so a collaborator
 * learns the host is gone in well under a second instead of waiting out the
 * lease. It is only ever a hint — the server owns the verdict — because an entry
 * also disappears when the *observer's* own connection drops, and because a host
 * that is merely reloading will be back.
 */
export function useHostPresence(awareness: AwarenessLike | null | undefined): UseHostPresenceReturn {
  const [hostPresent, setHostPresent] = useState(false)
  const [hostSeen, setHostSeen] = useState(false)

  // Kept in a ref as well so the subscription does not need to re-run to see it.
  const seenRef = useRef(false)

  useEffect(() => {
    if (!awareness) {
      // A fresh provider means a fresh observation: carrying "we have seen a
      // host" across a reconnect would let the countdown start from an
      // observation made on a connection that no longer exists.
      seenRef.current = false
      setHostSeen(false)
      setHostPresent(false)
      return
    }

    const read = () => {
      let present = false
      awareness.getStates().forEach((state, clientId) => {
        if (clientId === awareness.clientID) return
        if (state?.[HOST_AWARENESS_FIELD] === HOST_AWARENESS_HOST) present = true
      })
      setHostPresent(present)
      if (present && !seenRef.current) {
        seenRef.current = true
        setHostSeen(true)
      }
    }

    read()
    awareness.on('change', read)
    return () => awareness.off('change', read)
  }, [awareness])

  return { hostPresent, hostSeen }
}
