import type { FileItem } from '../editor-extensions/component/FileContext';
import {
    isItemSelectable,
    normalizeConfirmedSelection,
    reconcileSelectedFiles,
    resolveNextSelection,
} from './file-selection';
import { normalizeFileName } from './fileUtils';

let passed = 0;
let failed = 0;

const check = (name: string, condition: boolean, extra?: unknown) => {
    if (condition) {
        passed += 1;
        console.log(`  ok   ${name}`);
    } else {
        failed += 1;
        console.log(`  FAIL ${name}${extra === undefined ? '' : ` -> ${JSON.stringify(extra)}`}`);
    }
};

const item = (
    id: string,
    name: string,
    isFolder: boolean,
    mediaType?: FileItem['mediaType'],
): FileItem => ({
    id,
    name,
    isFolder,
    mediaType,
    type: { value: isFolder ? 'FOLDER' : 'FILE' },
});

const folder = item('folder', 'Design', true);
const png = item('png', 'cover.PNG', false, { value: 'IMAGE' });
const pdf = item('pdf', 'notes.pdf', false, 'PDF');
const text = item('text', 'notes.txt', false, 'OTHER');
const trashedFolder = { ...folder, id: 'trashed-folder', trashed: 1 };

console.log('\nFile name normalization');
check('keeps a valid file name', normalizeFileName('report.pdf', 'file-1') === 'report.pdf');
check('replaces a null name with a visible id', normalizeFileName(null, 'file-1') === '#file-1');
check('replaces a blank name with a visible id', normalizeFileName('   ', 42) === '#42');

console.log('\nSelection policy');
check('folder target accepts folders', isItemSelectable(folder, { target: 'folder' }));
check('folder target rejects files', !isItemSelectable(png, { target: 'folder' }));
check('file target accepts files', isItemSelectable(pdf, { target: 'file' }));
check('file target rejects folders', !isItemSelectable(folder, { target: 'file' }));
check('both target accepts both kinds', [folder, png].every((candidate) => isItemSelectable(candidate, { target: 'both' })));
check('extension accept is case insensitive', isItemSelectable(png, { target: 'file', accept: ['.png'] }));
check('MIME wildcard matches backend media category', isItemSelectable(png, { target: 'file', accept: ['image/*'] }));
check('exact MIME matches backend media category', isItemSelectable(pdf, { target: 'file', accept: ['application/pdf'] }));
check('exact image MIME matches filename extension', isItemSelectable(png, { target: 'file', accept: ['image/png'] }));
check('exact text MIME matches filename extension', isItemSelectable(text, { target: 'file', accept: ['text/plain'] }));
check('accept rejects a different file type', !isItemSelectable(text, { target: 'file', accept: ['image/*'] }));
check('accept does not reject selectable folders', isItemSelectable(folder, { target: 'both', accept: ['image/*'] }));
check('trashed items cannot be selected', !isItemSelectable(trashedFolder, { target: 'folder' }));

console.log('\nSelection transitions');
const single = resolveNextSelection({
    selectedFiles: [png],
    item: pdf,
    modifiers: { metaKey: true, shiftKey: true },
    orderedItems: [png, pdf],
    anchorId: 'png',
    multiple: false,
    selectable: () => true,
});
check('single mode ignores accumulation modifiers', single.length === 1 && single[0].id === 'pdf', single);

const range = resolveNextSelection({
    selectedFiles: [png],
    item: text,
    modifiers: { shiftKey: true },
    orderedItems: [png, folder, pdf, text],
    anchorId: 'png',
    multiple: true,
    selectable: (candidate) => isItemSelectable(candidate, { target: 'file' }),
});
check('range selection excludes ineligible items', range.map((candidate) => candidate.id).join(',') === 'png,pdf,text', range);

const normalized = normalizeConfirmedSelection([folder, png, pdf], {
    target: 'file',
    multiple: false,
});
check('confirmation filters invalid items and truncates single mode', normalized.length === 1 && normalized[0].id === 'png', normalized);

const refreshedPng = { ...png, name: 'cover-renamed.png' };
const reconciled = reconcileSelectedFiles([png, pdf], [refreshedPng]);
check('reconciliation replaces snapshots and drops missing items', reconciled.length === 1 && reconciled[0] === refreshedPng, reconciled);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
