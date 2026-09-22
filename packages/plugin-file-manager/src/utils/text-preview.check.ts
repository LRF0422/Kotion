import { getPreviewKind, isPreviewable, isTextFile } from './fileUtils';
import {
    MAX_TEXT_PREVIEW_BYTES,
    decodeTextBytes,
    looksBinary,
    readPreviewBytes,
} from './text-preview';

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

const main = async () => {
    console.log('\nText file classification');
    check('sql is text', isTextFile('schema.sql'));
    check('literal .text extension is text', isTextFile('notes.text'));
    check('uppercase extension is text', isTextFile('SCHEMA.SQL'));
    check('config file is text', isTextFile('app.toml') && isTextFile('.env'));
    check('extension-less Dockerfile is text', isTextFile('Dockerfile'));
    check('unknown binary is not text', !isTextFile('archive.bin') && !isTextFile('photo.png'));

    console.log('\nPreview kind');
    check('sql previews as text', getPreviewKind('schema.sql') === 'text');
    check('semantic TEXT hint previews as text', getPreviewKind('blob', 'TEXT') === 'text');
    check('text/plain MIME previews as text', getPreviewKind('blob', 'text/plain; charset=utf-8') === 'text');
    check('text files are previewable', isPreviewable('schema.sql'));
    check('binary files stay unsupported', getPreviewKind('archive.bin') === 'none');

    console.log('\nDecoding');
    const utf8 = new TextEncoder().encode('SELECT * FROM 用户;');
    check('decodes UTF-8', decodeTextBytes(utf8) === 'SELECT * FROM 用户;');
    // '中文' encoded as GBK.
    check('falls back to GB18030', decodeTextBytes(new Uint8Array([0xd6, 0xd0, 0xce, 0xc4])) === '中文');
    check('blank bytes decode to empty string', decodeTextBytes(new Uint8Array()) === '');
    check('binary detection finds NUL bytes', looksBinary(new Uint8Array([1, 2, 0, 4])));
    check('plain text is not detected as binary', !looksBinary(utf8));

    console.log('\nBlob slicing');
    const small = await readPreviewBytes(new Blob(['hello']));
    check('small blob is not truncated', !small.truncated && decodeTextBytes(small.bytes) === 'hello');
    const big = await readPreviewBytes(new Blob([new Uint8Array(MAX_TEXT_PREVIEW_BYTES + 10)]));
    check('big blob is truncated', big.truncated && big.bytes.length === MAX_TEXT_PREVIEW_BYTES);

    console.log(`\n${passed} passed, ${failed} failed`);
    process.exit(failed === 0 ? 0 : 1);
};

void main();
