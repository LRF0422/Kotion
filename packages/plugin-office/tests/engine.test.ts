/**
 * Engine selection.
 *
 * The rollback path only works if the flag is honoured exactly: a selector that
 * silently ignores `jspreadsheet` would strand us with no way back once the new
 * engine ships. The override is also expected to be non-sticky, so an incident
 * override does not survive a reload.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
    defaultEngine,
    engineFromHost,
    ENGINE_GLOBAL_KEY,
    resolveEngine,
    setEngineOverride,
} from '../src/spreadsheet/engine.ts'

test('VTable is the default when nothing is configured', () => {
    assert.equal(defaultEngine(undefined), 'vtable')
    assert.equal(defaultEngine(''), 'vtable')
    assert.equal(defaultEngine('   '), 'vtable')
    assert.equal(defaultEngine('anything-else'), 'vtable')
})

test('the rollback flag selects jspreadsheet, case- and space-insensitively', () => {
    assert.equal(defaultEngine('jspreadsheet'), 'jspreadsheet')
    assert.equal(defaultEngine(' Jspreadsheet '), 'jspreadsheet')
    assert.equal(defaultEngine('JSPREADSHEET'), 'jspreadsheet')
})

test('an override wins over the host setting, and can be cleared', () => {
    try {
        setEngineOverride('jspreadsheet')
        assert.equal(resolveEngine(undefined), 'jspreadsheet')
        assert.equal(resolveEngine('vtable'), 'jspreadsheet', 'override beats the host value')

        setEngineOverride('vtable')
        assert.equal(resolveEngine('jspreadsheet'), 'vtable')

        setEngineOverride(null)
        assert.equal(resolveEngine('jspreadsheet'), 'jspreadsheet', 'clearing returns to the default')
        assert.equal(resolveEngine(undefined), 'vtable')
    } finally {
        // Never leak an override into another test.
        setEngineOverride(null)
    }
})

test('the host value is optional and read from one documented key', () => {
    assert.equal(ENGINE_GLOBAL_KEY, '__KN_SPREADSHEET_ENGINE__')
    assert.equal(engineFromHost(undefined), undefined, 'absent means "use the default"')
    assert.equal(engineFromHost({}), undefined)
    assert.equal(engineFromHost({ spreadsheetEngine: 'jspreadsheet' }), 'jspreadsheet')
    assert.equal(engineFromHost({ spreadsheetEngine: 'vtable' }), 'vtable')
})

test('an unknown host value falls back to VTable rather than throwing', () => {
    assert.equal(engineFromHost({ spreadsheetEngine: 'nonsense' }), 'vtable')
})
