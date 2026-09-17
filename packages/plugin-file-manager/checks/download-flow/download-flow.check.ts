/**
 * End-to-end check for the file download flow.
 *
 * Regression guard for the two reported failures:
 *  - "clicking Download opens a tab full of garbled bytes" — the flow must never
 *    navigate to the raw storage URL;
 *  - "no save dialog and large files time out" — the save dialog has to be
 *    requested before any network round trip (user activation), and the payload
 *    must be streamed rather than buffered through the API request.
 *
 * Runs in Node against browser stubs; see `preload.cjs` and the tsconfig in
 * this folder for how the browser-only `@kn/common` import is substituted.
 */
import { downloadTarget } from '../../src/utils/download';
import type { FileService } from './download-flow.stubs';

// ---------------------------------------------------------------------------
// Browser stubs
// ---------------------------------------------------------------------------

interface SavedFile {
    name: string;
    blob: Blob;
}

const saved: SavedFile[] = [];
const opened: string[] = [];
const anchored = new Map<string, Blob>();
let objectUrlSeq = 0;

(globalThis as any).URL.createObjectURL = (blob: Blob): string => {
    const url = `blob:verify-${objectUrlSeq++}`;
    anchored.set(url, blob);
    return url;
};
(globalThis as any).URL.revokeObjectURL = (url: string): void => {
    anchored.delete(url);
};

const makeAnchor = (): any => ({
    href: '',
    download: '',
    rel: '',
    style: {},
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    click() {
        const blob = anchored.get(this.href);
        if (!blob) throw new Error(`anchor has no blob: ${this.href}`);
        saved.push({ name: this.download, blob });
    },
    remove: () => undefined,
});

(globalThis as any).document = {
    createElement: (tag: string) => {
        if (tag !== 'a') throw new Error(`unexpected element: ${tag}`);
        return makeAnchor();
    },
    body: { appendChild: () => undefined },
};
(globalThis as any).window = {
    open: (url: string) => {
        opened.push(url);
        if (popupBlocked) return null;
        return { opener: {} };
    },
    setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms),
    clearTimeout,
};

const savedText = async (index: number): Promise<string> => {
    const entry = saved[index];
    return entry ? await entry.blob.text() : '';
};

// ---------------------------------------------------------------------------
// Save-picker + API stubs
// ---------------------------------------------------------------------------

interface FakeHandle {
    suggestedName?: string;
    pickerOptions?: any;
    chunks: Uint8Array[];
    closed: boolean;
    aborted: boolean;
    abortedWith?: unknown;
}

let lastHandle: FakeHandle | null = null;
let pickerCalls = 0;
let pickerError: unknown = null;
let popupBlocked = false;

/** Fake FSA handle: a real WritableStream plus the FSA-only `write()` helper. */
const makeFakeHandle = (options: any): FakeHandle => {
    const handle: FakeHandle = {
        suggestedName: options?.suggestedName,
        pickerOptions: options,
        chunks: [],
        closed: false,
        aborted: false,
    };
    return handle;
};

const makeFakeWritable = (handle: FakeHandle): any => {
    const stream = new WritableStream<Uint8Array>({
        write(chunk) {
            handle.chunks.push(chunk);
        },
        close() {
            handle.closed = true;
        },
        abort(reason) {
            handle.aborted = true;
            handle.abortedWith = reason;
        },
    });
    // `FileSystemWritableFileStream` also exposes write/close/abort directly.
    return Object.assign(stream, {
        write: async (data: any) => {
            if (data instanceof Blob) handle.chunks.push(new Uint8Array(await data.arrayBuffer()));
            else if (data instanceof Uint8Array) handle.chunks.push(data);
        },
        close: async () => {
            handle.closed = true;
        },
        abort: async (reason?: unknown) => {
            handle.aborted = true;
            handle.abortedWith = reason;
        },
    });
};

const installPicker = (): void => {
    (globalThis as any).window.showSaveFilePicker = async (options: any) => {
        pickerCalls += 1;
        if (pickerError) throw pickerError;
        const handle = makeFakeHandle(options);
        lastHandle = handle;
        return { createWritable: async () => makeFakeWritable(handle) };
    };
};

installPicker();

const handleText = (handle: FakeHandle | null): string =>
    handle ? Buffer.concat(handle.chunks.map((chunk) => Buffer.from(chunk))).toString('utf8') : '';

let apiResponse: (() => Promise<Response>) | null = null;
let apiCalls = 0;

(globalThis as any).__authorizedFetch = async (url: string): Promise<Response> => {
    apiCalls += 1;
    if (!apiResponse) throw new Error(`unexpected API download: ${url}`);
    return apiResponse();
};

const reset = () => {
    saved.length = 0;
    opened.length = 0;
    anchored.clear();
    lastHandle = null;
    pickerCalls = 0;
    pickerError = null;
    popupBlocked = false;
    apiCalls = 0;
    apiResponse = null;
};

const streamOf = (parts: string[], headers: Record<string, string> = {}): Response => {
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
        start(controller) {
            parts.forEach((part) => controller.enqueue(encoder.encode(part)));
            controller.close();
        },
    });
    return new Response(body, { headers: { 'content-type': 'application/octet-stream', ...headers } });
};

const jsonError = (payload: unknown): Response =>
    new Response(JSON.stringify(payload), { headers: { 'content-type': 'application/json' } });

// ---------------------------------------------------------------------------
// Check harness
// ---------------------------------------------------------------------------

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

interface ServiceOptions {
    access?: { downloadUrl: string } | Error;
    url?: string;
}

const makeService = (options: ServiceOptions = {}): FileService => ({
    getDownloadUrl: (fileName: string) =>
        options.url ?? `https://kotion.top:888/api/knowledge-resource/oss/endpoint/download?fileName=${fileName}`,
    getFileAccessUrls: async () => {
        if (options.access instanceof Error) throw options.access;
        if (!options.access) throw new Error('no access urls configured');
        return { previewUrl: 'preview', expiresAt: '', ...options.access };
    },
});

const run = async () => {
    console.log('\nSave dialog is requested before any network round trip');
    {
        reset();
        const order: string[] = [];
        const originalPicker = (globalThis as any).window.showSaveFilePicker;
        (globalThis as any).window.showSaveFilePicker = async (options: any) => {
            order.push('picker');
            return originalPicker(options);
        };
        apiResponse = async () => {
            order.push('api');
            return streamOf(['DMG-', 'BYTES']);
        };
        const outcome = await downloadTarget(makeService(), {
            id: '42',
            name: 'installer.dmg',
            path: 'upload/20260917/131b3fc.dmg',
            size: 9,
        });
        (globalThis as any).window.showSaveFilePicker = originalPicker;

        check('picker ran first', order[0] === 'picker', order);
        check('suggested the real name', lastHandle?.suggestedName === 'installer.dmg', lastHandle?.suggestedName);
        check('filtered by extension', lastHandle?.pickerOptions?.types?.[0]?.accept?.['application/octet-stream']?.[0] === '.dmg');
        check('outcome is saved', outcome === 'saved', outcome);
        check('streamed every chunk in order', handleText(lastHandle) === 'DMG-BYTES', handleText(lastHandle));
        check('closed the file', lastHandle?.closed === true);
        check('never opened a tab', opened.length === 0, opened);
        check('never buffered via the anchor path', saved.length === 0, saved);
    }

    console.log('\nProgress is reported while streaming');
    {
        reset();
        const percents: number[] = [];
        apiResponse = async () => streamOf(['aaaa', 'bbbb', 'cccc', 'dddd'], { 'content-length': '16' });
        await downloadTarget(
            makeService(),
            { id: '1', name: 'big.bin', path: 'upload/big.bin', size: 16 },
            { onProgress: ({ loaded, total }) => percents.push(Math.floor((loaded / (total ?? 1)) * 100)) },
        );
        check('reported increasing progress', percents.length > 1 && percents[0] < percents[percents.length - 1], percents);
        check('never exceeded 100%', percents.every((percent) => percent <= 100), percents);
        check('wrote the whole payload', handleText(lastHandle) === 'aaaabbbbccccdddd', handleText(lastHandle));
    }

    console.log('\nCancelling the dialog saves nothing');
    {
        reset();
        pickerError = Object.assign(new Error('aborted'), { name: 'AbortError' });
        const outcome = await downloadTarget(makeService(), { id: '2', name: 'x.dmg', path: 'upload/x.dmg' });
        check('reported cancelled', outcome === 'cancelled', outcome);
        check('never requested the file', apiCalls === 0, apiCalls);
        check('saved nothing', saved.length === 0, saved);
    }

    console.log('\nA failed stream leaves no partial file');
    {
        reset();
        apiResponse = async () => {
            const encoder = new TextEncoder();
            let sent = false;
            return new Response(
                new ReadableStream<Uint8Array>({
                    pull(controller) {
                        if (!sent) {
                            sent = true;
                            controller.enqueue(encoder.encode('PARTIAL'));
                            return;
                        }
                        controller.error(new Error('connection lost'));
                    },
                }),
                { headers: { 'content-type': 'application/octet-stream' } },
            );
        };
        let message = '';
        try {
            await downloadTarget(makeService(), { id: '3', name: 'p.bin', path: 'upload/p.bin' });
        } catch (error) {
            message = error instanceof Error ? error.message : String(error);
        }
        check('aborted the writable', lastHandle?.aborted === true, lastHandle);
        check('surfaced the failure', message.includes('connection lost') || message.length > 0, message);
        check('never fell back to a silent save', saved.length === 0, saved);
    }

    console.log('\nAPI error envelopes are surfaced, not saved');
    {
        reset();
        apiResponse = async () => jsonError({ code: 500, msg: '服务器内部错误' });
        (globalThis as any).fetch = async () => {
            throw new Error('network down');
        };
        let message = '';
        try {
            await downloadTarget(makeService({ url: 'https://oss/err' }), {
                id: '4',
                name: 'a.dmg',
                path: 'upload/a.dmg',
            });
        } catch (error) {
            message = error instanceof Error ? error.message : String(error);
        }
        check('threw the server message', message === '服务器内部错误', message);
        check('wrote nothing', handleText(lastHandle) === '', handleText(lastHandle));
        check('saved nothing', saved.length === 0, saved);
    }

    console.log('\nStorage URL is used when the API download fails');
    {
        reset();
        apiResponse = async () => new Response('nope', { status: 404 });
        (globalThis as any).fetch = async (url: string) => {
            if (!String(url).startsWith('https://kotion.top:888/api/knowledge-resource')) {
                throw new Error(`unexpected url ${url}`);
            }
            return streamOf(['ZIP-BYTES'], { 'content-type': 'application/zip' });
        };
        const outcome = await downloadTarget(makeService(), {
            id: '5',
            name: 'bundle.zip',
            path: 'upload/bundle.zip',
            size: 9,
        });
        check('saved through the dialog', outcome === 'saved', outcome);
        check('wrote the storage bytes', handleText(lastHandle) === 'ZIP-BYTES', handleText(lastHandle));
        check('never opened a tab', opened.length === 0, opened);
    }

    console.log('\nWithout a save picker: large files are handed to the browser');
    {
        reset();
        (globalThis as any).window.showSaveFilePicker = undefined;
        const service = makeService({ access: { downloadUrl: 'https://s3.example.com/big.dmg?sign=abc' } });
        const outcome = await downloadTarget(service, {
            id: '6',
            name: 'big.dmg',
            path: 'upload/big.dmg',
            size: 200 * 1024 * 1024,
        });
        check('reported handed-off', outcome === 'handed-off', outcome);
        check('opened the signed URL', opened[0] === 'https://s3.example.com/big.dmg?sign=abc', opened);
        check('never buffered the file', apiCalls === 0 && saved.length === 0, { apiCalls, saved: saved.length });

        installPicker();
    }

    console.log('\nA blocked popup still saves the file');
    {
        reset();
        (globalThis as any).window.showSaveFilePicker = undefined;
        popupBlocked = true;
        (globalThis as any).fetch = async () => streamOf(['FALLBACK'], { 'content-length': '8' });
        const outcome = await downloadTarget(
            makeService({ access: { downloadUrl: 'https://s3.example.com/big.dmg?sign=abc' } }),
            { id: '8', name: 'big.dmg', path: 'upload/big.dmg', size: 200 * 1024 * 1024 },
        );
        check('reported saved', outcome === 'saved', outcome);
        check('tried the signed URL', opened[0] === 'https://s3.example.com/big.dmg?sign=abc', opened);
        check('buffered instead', (await savedText(0)) === 'FALLBACK', await savedText(0));

        installPicker();
    }

    console.log('\nWithout a save picker: small files fall back to an anchor save');
    {
        reset();
        (globalThis as any).window.showSaveFilePicker = undefined;
        apiResponse = async () => streamOf(['SMALL'], { 'content-length': '5' });
        const outcome = await downloadTarget(makeService(), {
            id: '7',
            name: 'notes.txt',
            path: 'upload/notes.txt',
            size: 5,
        });
        check('reported saved', outcome === 'saved', outcome);
        check('anchor used the display name', saved[0]?.name === 'notes.txt', saved[0]?.name);
        check('anchor got the bytes', (await savedText(0)) === 'SMALL', await savedText(0));
    }

    console.log(`\n${passed} passed, ${failed} failed`);
    process.exit(failed === 0 ? 0 : 1);
};

void run();
