/**
 * Runtime checks for the desktop `http.request` network policy.
 *
 * The guard is the app's only SSRF surface, and the user-facing switch is the
 * one thing that can widen it, so both directions are pinned here:
 *
 * - default deny is unchanged for every range the pre-policy guard blocked
 *   (loopback, RFC1918, link-local, ULA) plus the literals the old guard missed
 *   (`::ffff:c0a8:101`, NAT64);
 * - the switch lifts exactly those and nothing else — cloud metadata endpoints,
 *   the protocol whitelist and a malformed policy payload stay refused.
 *
 * Run with: pnpm --filter @kn/desktop check:net-policy
 */

import {
    DEFAULT_NET_POLICY,
    classifyAddress,
    decideResolvedAddress,
    decideTarget,
    normalizeNetPolicy,
    type DesktopNetPolicy,
} from './net-policy';

let pass = 0;
let fail = 0;

function check(name: string, condition: boolean, actual?: unknown): void {
    if (condition) {
        pass += 1;
        console.log('  ok   ' + name);
    } else {
        fail += 1;
        console.log('  FAIL ' + name + (actual === undefined ? '' : '  -> ' + JSON.stringify(actual)));
    }
}

function checkEqual(name: string, actual: unknown, expected: unknown): void {
    check(
        name + (JSON.stringify(actual) === JSON.stringify(expected)
            ? ''
            : ` (got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)})`),
        JSON.stringify(actual) === JSON.stringify(expected),
    );
}

const DENY: DesktopNetPolicy = { allowPrivateNetwork: false };
const ALLOW: DesktopNetPolicy = { allowPrivateNetwork: true };

/** The message a literal target is refused with, or 'allowed'. */
const lit = (url: string, policy: DesktopNetPolicy): string => {
    const decision = decideTarget(url, policy);
    return decision.action === 'deny' ? decision.reason : decision.action;
};

/** The message a hostname's resolved address is refused with, or 'allowed'. */
const res = (address: string, policy: DesktopNetPolicy): string => {
    const decision = decideResolvedAddress(address, policy);
    return decision.action === 'deny' ? decision.reason : decision.action;
};

function main(): void {
    console.log('\nDefault deny (unchanged from the pre-policy guard)');
    checkEqual('RFC1918 192.168.x is refused', lit('http://192.168.2.119', DENY), 'desktop http: private address is blocked');
    checkEqual('RFC1918 10.x is refused', lit('http://10.0.0.7:8080/rest', DENY), 'desktop http: private address is blocked');
    checkEqual('RFC1918 172.16-31.x is refused', lit('http://172.20.1.1', DENY), 'desktop http: private address is blocked');
    checkEqual('loopback IPv4 is refused', lit('http://127.0.0.1:54321', DENY), 'desktop http: private address is blocked');
    checkEqual('this-network 0.x is refused', lit('http://0.0.0.0:80', DENY), 'desktop http: private address is blocked');
    checkEqual('link-local is refused', lit('http://169.254.10.10', DENY), 'desktop http: private address is blocked');
    checkEqual('localhost is refused by name', lit('http://localhost:3000', DENY), 'desktop http: localhost is blocked');
    checkEqual('a *.localhost name is refused too', lit('http://api.localhost:3000', DENY), 'desktop http: localhost is blocked');
    checkEqual('IPv6 loopback is refused', lit('http://[::1]:9000', DENY), 'desktop http: private address is blocked');
    checkEqual('IPv6 ULA is refused', lit('http://[fd00::1]:9000', DENY), 'desktop http: private address is blocked');
    checkEqual('IPv6 link-local is refused', lit('http://[fe80::1]:9000', DENY), 'desktop http: private address is blocked');
    checkEqual(
        'IPv4-mapped IPv6 in hex form is refused',
        lit('http://[::ffff:c0a8:101]:9000', DENY),
        'desktop http: private address is blocked',
    );
    checkEqual(
        'NAT64-wrapped loopback is refused',
        lit('http://[64:ff9b::7f00:1]:9000', DENY),
        'desktop http: private address is blocked',
    );
    checkEqual('a public address stays allowed', lit('https://1.1.1.1/dns-query', DENY), 'allow');
    const publicName = decideTarget('https://api.example.com/v1', DENY);
    checkEqual('a public name is handed to the resolver, not blocked', publicName.action, 'resolve');

    console.log('\nThe switch lifts LAN targets — and only those');
    checkEqual('the LAN gateway from the report is allowed', lit('http://192.168.2.119', ALLOW), 'allow');
    checkEqual('loopback is allowed', lit('http://127.0.0.1:8080', ALLOW), 'allow');
    checkEqual('localhost is allowed by name', lit('http://localhost:3000', ALLOW), 'allow');
    checkEqual('IPv6 ULA is allowed', lit('http://[fd00::1]:9000', ALLOW), 'allow');
    checkEqual('10.x is allowed', lit('http://10.1.2.3', ALLOW), 'allow');
    checkEqual('protocol whitelist survives the switch', lit('file:///etc/passwd', ALLOW), 'desktop http: only http/https is allowed');
    checkEqual('ftp is still refused', lit('ftp://192.168.2.119', ALLOW), 'desktop http: only http/https is allowed');
    checkEqual('cloud metadata (AWS/GCP/Azure) stays refused', lit('http://169.254.169.254/latest/meta-data', ALLOW), 'desktop http: cloud metadata address is blocked');
    checkEqual('cloud metadata (Aliyun) stays refused', lit('http://100.100.100.200/latest/meta-data', ALLOW), 'desktop http: cloud metadata address is blocked');
    checkEqual('cloud metadata (IPv6) stays refused', lit('http://[fd00:ec2::254]/latest/meta-data', ALLOW), 'desktop http: cloud metadata address is blocked');
    checkEqual('metadata is refused with the switch off as well', lit('http://169.254.169.254/', DENY), 'desktop http: cloud metadata address is blocked');
    checkEqual('a malformed URL is refused', lit('not a url', ALLOW), 'desktop http: invalid URL');

    console.log('\nHostnames are resolved, then judged per answer');
    const pending = decideTarget('http://gateway.internal:54321/rest', DENY);
    checkEqual('a name is handed back for resolution', pending.action, 'resolve');
    checkEqual(
        'a name that resolves private is refused',
        res('192.168.2.119', DENY),
        'desktop http: resolves to a private address',
    );
    checkEqual('the same name is allowed once the switch is on', res('192.168.2.119', ALLOW), 'allow');
    checkEqual(
        'a name that resolves to metadata is refused even with the switch on',
        res('169.254.169.254', ALLOW),
        'desktop http: cloud metadata address is blocked',
    );
    checkEqual('a public answer is allowed', res('93.184.216.34', DENY), 'allow');
    checkEqual('public IPv6 answers are allowed', res('2606:4700::1111', DENY), 'allow');

    console.log('\nAddress classification');
    checkEqual('mapped IPv4 is classified by the embedded address', classifyAddress('::ffff:192.168.1.1'), 'private');
    checkEqual('hex mapped IPv4 is classified by the embedded address', classifyAddress('::ffff:c0a8:101'), 'private');
    checkEqual('a public literal is public', classifyAddress('8.8.8.8'), 'public');
    checkEqual('a bogus octet is not a private literal', classifyAddress('999.1.1.1'), 'public');
    checkEqual('metadata wins over private', classifyAddress('169.254.169.254'), 'metadata');

    console.log('\nStored policy parsing');
    checkEqual('a missing payload falls back to deny', normalizeNetPolicy(undefined), DEFAULT_NET_POLICY);
    checkEqual('a non-object payload falls back to deny', normalizeNetPolicy('yes'), DEFAULT_NET_POLICY);
    checkEqual('a truthy-but-not-true payload stays deny', normalizeNetPolicy({ allowPrivateNetwork: 'yes' }), DEFAULT_NET_POLICY);
    checkEqual('an explicit true is honoured', normalizeNetPolicy({ allowPrivateNetwork: true }), ALLOW);
    checkEqual('an explicit false is honoured', normalizeNetPolicy({ allowPrivateNetwork: false }), DENY);
    checkEqual('unknown keys are dropped', normalizeNetPolicy({ allowPrivateNetwork: true, extra: 1 }), ALLOW);

    console.log('\n' + pass + ' passed, ' + fail + ' failed');
    if (fail > 0) process.exit(1);
}

main();
