/**
 * Context-menu translations.
 *
 * The engine ships hardcoded Chinese menu labels; these dictionaries let the
 * adapter re-label them in the app language (see `translateContextMenuItems`).
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { t, translations } from '../src/i18n/translate.ts'

const MENU_KEYS = [
    'copy',
    'cut',
    'paste',
    'insert',
    'insert_row_above',
    'insert_row_below',
    'insert_column_left',
    'insert_column_right',
    'delete',
    'delete_row',
    'delete_column',
    'freeze',
    'freeze_to_this_row',
    'freeze_to_this_column',
    'freeze_to_this_row_and_column',
    'unfreeze',
    'merge_cells',
    'unmerge_cells',
    'hide_column',
    'sort',
    'set_filter',
    'cancel_filter',
    'enable_first_row_as_header',
    'disable_first_row_as_header',
]

test('every context-menu label has en and zh translations', () => {
    for (const key of MENU_KEYS) {
        const path = `spreadsheet.contextMenu.${key}`
        const en = t('en', path)
        const zh = t('zh', path)
        assert.notEqual(en, path, `${path} is missing an English label`)
        assert.notEqual(zh, path, `${path} is missing a Chinese label`)
        assert.notEqual(en, zh, `${path} should differ between languages`)
    }
})

test('the sheet-tab tooltips have en and zh labels', () => {
    for (const key of ['add', 'menu', 'scrollLeft', 'scrollRight']) {
        const path = 'spreadsheet.sheet.' + key
        assert.notEqual(t('en', path), path)
        assert.notEqual(t('zh', path), path)
    }
})

test('the en and zh dictionaries expose the same context-menu keys', () => {
    const enKeys = Object.keys(translations.en.spreadsheet.contextMenu).sort()
    const zhKeys = Object.keys(translations.zh.spreadsheet.contextMenu).sort()
    assert.deepEqual(enKeys, zhKeys)
})
