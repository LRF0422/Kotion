import {
    collectDroppedSelection,
    groupFilesByDirectory,
    normalizeFolderPath,
    pickFolderSelection,
    planFolderUpload,
    type FolderUploadSelection,
} from './folder-upload';

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

const file = (name: string): File => ({ name } as unknown as File);

console.log('\nPath normalization');
check('keeps nested paths', normalizeFolderPath('photos/2024/a.png') === 'photos/2024/a.png');
check('converts windows separators', normalizeFolderPath('photos\\2024\\a.png') === 'photos/2024/a.png');
check('drops traversal segments', normalizeFolderPath('../photos/./a.png') === 'photos/a.png');
check('collapses empty segments', normalizeFolderPath('photos//a.png') === 'photos/a.png');
check('handles non-strings', normalizeFolderPath(undefined) === '');

console.log('\nFolder plan');
const selection: FolderUploadSelection = {
    entries: [
        { file: file('cover.jpg'), relativePath: 'photos/cover.jpg' },
        { file: file('a.png'), relativePath: 'photos/2024/raw/a.png' },
        { file: file('notes.txt'), relativePath: 'photos/2024/notes.txt' },
        { file: file('readme.md'), relativePath: 'readme.md' },
    ],
    directories: ['photos/empty'],
};
const plan = planFolderUpload(selection);
const paths = plan.directories.map((directory) => directory.path);
check('creates the root folder', paths.includes('photos'), paths);
check('creates nested folders', paths.includes('photos/2024') && paths.includes('photos/2024/raw'), paths);
check('keeps empty folders', paths.includes('photos/empty'), paths);
check('orders parents before children', paths.indexOf('photos') < paths.indexOf('photos/2024')
    && paths.indexOf('photos/2024') < paths.indexOf('photos/2024/raw'), paths);
check('deduplicates directories', new Set(paths).size === paths.length, paths);
check('resolves folder names', plan.directories.every((directory) => directory.name === directory.path.split('/').pop()));

const byPath = new Map(plan.directories.map((directory) => [directory.path, directory]));
check('links child to parent', byPath.get('photos/2024/raw')?.parentPath === 'photos/2024');
check('root parent is the destination', byPath.get('photos')?.parentPath === '');

console.log('\nFile placement');
const placement = new Map(plan.files.map((entry) => [entry.file.name, entry.directoryPath]));
check('places root file inside the root folder', placement.get('cover.jpg') === 'photos', [...placement]);
check('places deep file inside its folder', placement.get('a.png') === 'photos/2024/raw', [...placement]);
check('places sibling file in intermediate folder', placement.get('notes.txt') === 'photos/2024', [...placement]);
check('places loose file in the destination', placement.get('readme.md') === '', [...placement]);

console.log('\nGrouping');
const groups = groupFilesByDirectory(plan.files);
const groupedByPath = new Map(groups.map((group) => [group.directoryPath, group.files.map((entry) => entry.name)]));
check('groups files per directory', groupedByPath.get('photos/2024')?.join(',') === 'notes.txt', [...groupedByPath]);
check('groups deep files together', groupedByPath.get('photos/2024/raw')?.join(',') === 'a.png', [...groupedByPath]);
check('preserves loose files group', groupedByPath.has(''), [...groupedByPath]);

console.log('\nEmpty inputs');
const emptyPlan = planFolderUpload();
check('empty plan has no entries', emptyPlan.directories.length === 0 && emptyPlan.files.length === 0);

const main = async () => {
    const dropped = await collectDroppedSelection(null);
    check('null drop yields empty selection', dropped.entries.length === 0 && dropped.directories.length === 0);

    console.log('\nElectron folder picker');
    const fileContents = new Map<string, string>([
        ['/Users/me/Photos/a.jpg', 'alpha'],
        ['/Users/me/Photos/2024/b.png', 'beta'],
    ]);
    const dirEntries = new Map<string, Array<{ name: string; isDirectory: boolean; isFile: boolean }>>([
        ['/Users/me/Photos', [
            { name: 'a.jpg', isDirectory: false, isFile: true },
            { name: '2024', isDirectory: true, isFile: false },
        ]],
        ['/Users/me/Photos/2024', [
            { name: 'empty', isDirectory: true, isFile: false },
            { name: 'b.png', isDirectory: false, isFile: true },
        ]],
        ['/Users/me/Photos/2024/empty', []],
    ]);
    let canceled = false;
    (globalThis as unknown as { window?: unknown }).window = {
        api: {
            invoke: async (channel: string, ...args: unknown[]) => {
                if (channel === 'dialog:openFolder') {
                    return canceled
                        ? { canceled: true, folderPath: null }
                        : { canceled: false, folderPath: '/Users/me/Photos' };
                }
                if (channel === 'fs:readdir') {
                    return { data: dirEntries.get(String(args[0])) ?? [] };
                }
                if (channel === 'fs:readFile') {
                    const content = fileContents.get(String(args[0])) ?? '';
                    return { data: Buffer.from(content).toString('base64') };
                }
                throw new Error(`unexpected channel ${channel}`);
            },
        },
    };

    const electronSelection = await pickFolderSelection();
    check('electron picker returns a selection', !!electronSelection);
    const electronPlan = planFolderUpload(electronSelection ?? { entries: [], directories: [] });
    const electronDirs = electronPlan.directories.map((directory) => directory.path);
    check('electron picker keeps the root folder', electronDirs.includes('Photos'), electronDirs);
    check('electron picker keeps nested and empty folders',
        electronDirs.includes('Photos/2024') && electronDirs.includes('Photos/2024/empty'), electronDirs);
    const electronFiles = electronPlan.files
        .map((entry) => `${entry.directoryPath}/${entry.file.name}`)
        .sort();
    check('electron picker places files by relative path',
        electronFiles.join(',') === 'Photos/2024/b.png,Photos/a.jpg', electronFiles);
    const firstFile = electronPlan.files.find((entry) => entry.file.name === 'a.jpg');
    check('electron picker reads file bytes', !!firstFile && await firstFile.file.text() === 'alpha');

    canceled = true;
    check('electron picker reports cancellation', (await pickFolderSelection()) === null);

    console.log(`\n${passed} passed, ${failed} failed`);
    process.exit(failed === 0 ? 0 : 1);
};

void main();
