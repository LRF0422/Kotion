import { useApi } from "@kn/common"
import { APIS } from "../api"

export interface UserBrief {
    name?: string
    avatar?: string
}

/**
 * Display info for a user id. The wiki APIs only ever return `createUser` /
 * `updateUser` as numeric ids, so any UI that wants to show an author has to
 * resolve the name separately.
 *
 * Cached per id so switching between pages by the same author — or rendering a
 * template list where every entry shares one author — never refetches.
 */
const userBriefCache = new Map<string, UserBrief | undefined>()

export async function resolveUserBrief(id?: string | number): Promise<UserBrief | undefined> {
    if (!id) return undefined
    const key = String(id)
    if (userBriefCache.has(key)) return userBriefCache.get(key)
    try {
        const res = await useApi(APIS.GET_USER_DETAIL, { id: key })
        const data = res?.data
        const brief = data ? { name: data.name || data.realName || data.account, avatar: data.avatar } : undefined
        userBriefCache.set(key, brief)
        return brief
    } catch {
        // Left uncached so a transient failure can be retried on the next render.
        return undefined
    }
}
