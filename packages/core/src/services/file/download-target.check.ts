import {
    LARGE_FILE_BUFFER_LIMIT,
    chooseDownloadStrategy,
    fileExtensionOf,
    resolveDownloadName,
} from './download-target';

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

console.log('\nDownload name resolution');
check('keeps the object key basename', resolveDownloadName('upload/20260917/abc.dmg') === 'abc.dmg');
check(
    'drops query strings from absolute URLs',
    resolveDownloadName('https://oss.example.com/uploads/report.pdf?sign=xyz') === 'report.pdf',
);
check('decodes percent-encoded names', resolveDownloadName('upload/%E6%8A%A5%E5%91%8A.pdf') === '报告.pdf');
check('keeps a name without extension', resolveDownloadName('upload/CHANGELOG') === 'CHANGELOG');
check('replaces path separators kept in the name', resolveDownloadName('upload/a\\b.dmg') === 'a_b.dmg');
check('strips leading dots', resolveDownloadName('upload/..hidden.dmg') === 'hidden.dmg');
check('falls back when there is no name', resolveDownloadName('') === 'download');
check('falls back for undefined input', resolveDownloadName(undefined) === 'download');
check('honours a custom fallback', resolveDownloadName('  ', 'file') === 'file');
check('survives malformed percent-encoding', resolveDownloadName('upload/100%.dmg') === '100%.dmg');

console.log('\nDownload extension');
check('reads the extension', fileExtensionOf('archive.tar.gz') === '.gz');
check('no extension yields empty', fileExtensionOf('README') === '');
check('dotfile has no extension', fileExtensionOf('.gitignore') === '');
check('trailing dot has no extension', fileExtensionOf('archive.') === '');

console.log('\nDownload strategy');
check('unknown size buffers', chooseDownloadStrategy(undefined) === 'buffer');
check('small file buffers', chooseDownloadStrategy(1024) === 'buffer');
check('exact limit buffers', chooseDownloadStrategy(LARGE_FILE_BUFFER_LIMIT) === 'buffer');
check('large file streams', chooseDownloadStrategy(LARGE_FILE_BUFFER_LIMIT + 1) === 'stream');
check('invalid size buffers', chooseDownloadStrategy(Number.NaN) === 'buffer');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
