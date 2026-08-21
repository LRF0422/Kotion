/**
 * Executable checks for `toRev`.
 *
 * This exists because the bug it prevents already happened. The loader and the
 * writer both read `rev` off JSON responses with `typeof x === 'number'`, which
 * is the obvious spelling and the wrong one: this backend registers
 * `ToStringSerializer` for every `Long`, so a rev arrives as `"3"`. Every real
 * rev was therefore read as absent, the loader concluded the page had never been
 * written, and it seeded the stale legacy column over a page that had content.
 *
 * A wire format is not something a type annotation can enforce, so it gets pinned
 * here instead: `pnpm --filter @kn/editor check:rev`.
 */
import { toRev } from './rev'

let pass = 0
let fail = 0

function check(name: string, cond: boolean, extra?: unknown): void {
  if (cond) {
    pass++
    console.log('  ok   ' + name)
  } else {
    fail++
    console.log('  FAIL ' + name + (extra !== undefined ? '  -> ' + JSON.stringify(extra) : ''))
  }
}

// ─── The shape the backend actually sends ─────────────────────────────

console.log('\nstring revs, which is what this backend sends')

check('a decimal string is a rev', toRev('3') === 3, toRev('3'))
check('"0" is zero, not absent', toRev('0') === 0, toRev('0'))
check(
  // The distinction the whole loader turns on: 0 licenses adopting legacy
  // content, null must not.
  'and zero is distinguishable from unknown',
  toRev('0') !== null && toRev(undefined) === null,
)
check('surrounding whitespace does not hide a rev', toRev(' 12 ') === 12, toRev(' 12 '))
check('a large rev survives', toRev('9007199254740991') === 9007199254740991)

// ─── Numbers, in case the convention ever changes ─────────────────────

console.log('\nnumber revs, in case the wire format changes back')

check('a number is taken as given', toRev(7) === 7, toRev(7))
check('zero as a number is still zero', toRev(0) === 0, toRev(0))

// ─── Absent ───────────────────────────────────────────────────────────

console.log('\nabsent')

check('null is unknown', toRev(null) === null)
check('undefined is unknown', toRev(undefined) === null)
check(
  // The empty string is the trap: `Number('')` is 0, so a lenient parser reports
  // "this page has never been written" for a field that was simply blank.
  'the empty string is unknown, not zero',
  toRev('') === null,
  toRev(''),
)
check('a blank string is unknown, not zero', toRev('   ') === null, toRev('   '))

// ─── Not a rev at all ─────────────────────────────────────────────────

console.log('\nvalues that cannot be a rev')

check('a non-numeric string is refused', toRev('abc') === null)
check('a partly-numeric string is refused', toRev('12abc') === null, toRev('12abc'))
check(
  // `Number` would happily read these. A rev is a counter printed in decimal;
  // anything else means we are looking at the wrong field.
  'hex and exponent notation are refused',
  toRev('0x10') === null && toRev('1e3') === null,
  [toRev('0x10'), toRev('1e3')],
)
check('a negative rev is refused', toRev(-1) === null && toRev('-1') === null)
check('a fractional rev is refused', toRev(1.5) === null && toRev('1.5') === null)
check('NaN and Infinity are refused', toRev(NaN) === null && toRev(Infinity) === null)
check(
  'a value past exact integer range is refused rather than silently rounded',
  toRev('9007199254740993') === null,
  toRev('9007199254740993'),
)
check(
  'objects, arrays and booleans are refused',
  toRev({}) === null && toRev([]) === null && toRev(true) === null && toRev([3]) === null,
)

// ─── Invariant ────────────────────────────────────────────────────────

console.log('\ninvariant')

{
  // Whatever comes back is a usable rev or nothing at all. Callers compare it
  // against other revs and send it as a `baseRev`, so a half-parsed value would
  // travel a long way before failing.
  const inputs: unknown[] = [
    '3', '0', ' 12 ', 7, 0, null, undefined, '', '  ', 'abc', '12abc', '0x10',
    '1e3', -1, '-1', 1.5, '1.5', NaN, Infinity, '9007199254740993', {}, [], true,
  ]
  const bad = inputs.filter((v) => {
    const r = toRev(v)
    return r !== null && !(Number.isSafeInteger(r) && r >= 0)
  })
  check('every answer is either null or a non-negative safe integer', bad.length === 0, bad)
}

console.log(`\n${pass} passed, ${fail} failed\n`)
process.exit(fail === 0 ? 0 : 1)
