import { API } from "@kn/common";

/** Plugin-local APIs that are not part of the shared Space/Page domain model. */
export const APIS = {
    /** Fetch a user's public profile by id for display hydration. */
    GET_USER_DETAIL: {
        url: '/knowledge-system/user/detail',
        method: 'GET'
    } as API,
    REGISTER: {
        url: '/knowledge-system/user/register',
        method: 'POST'
    } as API,
};
