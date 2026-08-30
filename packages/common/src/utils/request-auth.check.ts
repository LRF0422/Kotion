import {
    applyBearerAuthorization,
    getBearerAuthorization,
    isOAuthTokenRequest,
    shouldHandleUnauthorized,
} from './request-auth'

let pass = 0
let fail = 0

function check(name: string, condition: boolean, actual?: unknown): void {
    if (condition) {
        pass += 1
        console.log('  ok   ' + name)
    } else {
        fail += 1
        console.log('  FAIL ' + name + (actual === undefined ? '' : '  -> ' + JSON.stringify(actual)))
    }
}

console.log('\nOAuth token endpoint detection')

const tokenUrls = [
    '/knowledge-auth/oauth2/token',
    '/api/knowledge-auth/oauth2/token',
    'https://kotion.top:888/api/knowledge-auth/oauth2/token?audience=kotion-client',
]

for (const url of tokenUrls) {
    check(`recognizes ${url}`, isOAuthTokenRequest(url), url)
}

check(
    'does not match a protected endpoint',
    !isOAuthTokenRequest('/knowledge-system/user/getCurrentUser'),
)

console.log('\nAuthorization policy')

const staleToken = 'expired-access-token'
check(
    'an expired stored token is omitted from login',
    getBearerAuthorization('/knowledge-auth/oauth2/token', staleToken) === undefined,
)

const loginHeaders = new Headers({ authorization: `Bearer ${staleToken}` })
applyBearerAuthorization(loginHeaders, '/knowledge-auth/oauth2/token', staleToken)
check(
    'login strips a pre-existing Authorization header case-insensitively',
    !loginHeaders.has('Authorization'),
    loginHeaders.get('Authorization'),
)
check(
    'an expired stored token is omitted from a proxied login URL',
    getBearerAuthorization('/api/knowledge-auth/oauth2/token', staleToken) === undefined,
)
check(
    'protected requests still receive the stored token',
    getBearerAuthorization('/knowledge-system/user/getCurrentUser', staleToken) === `Bearer ${staleToken}`,
)

const protectedHeaders = new Headers()
applyBearerAuthorization(protectedHeaders, '/knowledge-system/user/getCurrentUser', staleToken)
check(
    'the request policy applies the stored token to protected requests',
    protectedHeaders.get('Authorization') === `Bearer ${staleToken}`,
    protectedHeaders.get('Authorization'),
)
check(
    'requests without a stored token have no application bearer value',
    getBearerAuthorization('/knowledge-system/user/getCurrentUser', null) === undefined,
)

console.log('\nUnauthorized response policy')

check(
    'a token-endpoint 401 remains a login failure',
    shouldHandleUnauthorized('/knowledge-auth/oauth2/token') === false,
)
check(
    'a protected-endpoint 401 enters session recovery',
    shouldHandleUnauthorized('/knowledge-system/user/getCurrentUser') === true,
)

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
