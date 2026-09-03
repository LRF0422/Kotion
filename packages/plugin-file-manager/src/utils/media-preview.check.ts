import { getPreviewKind, isPreviewable } from './fileUtils';
import {
    clampMediaSeek,
    formatMediaTime,
    getEffectiveDuration,
    resolveMediaKindFromDimensions,
} from '../editor-extensions/component/media/media-utils';

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

console.log('\nMedia classification');
check('WebM requires runtime media probing', getPreviewKind('meeting.webm', 'OTHER') === 'media');
check('uppercase WebM requires runtime media probing', getPreviewKind('MEETING.WEBM') === 'media');
check('audio MIME resolves WebM as audio', getPreviewKind('meeting.webm', 'audio/webm;codecs=opus') === 'audio');
check('video MIME resolves WebM as video', getPreviewKind('screen.webm', 'video/webm') === 'video');
check('semantic audio hint resolves audio', getPreviewKind('recording.bin', { value: 'AUDIO' }) === 'audio');
check('MP4 remains video', getPreviewKind('movie.mp4') === 'video');
check('MP3 remains audio', getPreviewKind('voice.mp3') === 'audio');
check('image preview remains unchanged', getPreviewKind('cover.png') === 'image');
check('PDF preview remains unchanged', getPreviewKind('report.pdf') === 'pdf');
check('text preview remains unchanged', getPreviewKind('notes.md') === 'text');
check('unknown extension remains unsupported', getPreviewKind('archive.bin') === 'none');
check('ambiguous WebM is still previewable', isPreviewable('meeting.webm', 'OTHER'));

console.log('\nMedia metadata resolution');
check('nonzero video width resolves video', resolveMediaKindFromDimensions(1920, 0) === 'video');
check('nonzero video height resolves video', resolveMediaKindFromDimensions(0, 1080) === 'video');
check('zero dimensions resolve audio-only media', resolveMediaKindFromDimensions(0, 0) === 'audio');
check('invalid dimensions do not resolve', resolveMediaKindFromDimensions(Number.NaN, 0) === null);

console.log('\nPlayback utilities');
check('native duration wins', getEffectiveDuration(60, 50, 40) === 60);
check('seekable end handles infinite duration', getEffectiveDuration(Number.POSITIVE_INFINITY, 50, 40) === 50);
check('fallback duration handles missing metadata', getEffectiveDuration(Number.NaN, 0, 40) === 40);
check('unknown duration stays zero', getEffectiveDuration(Number.NaN, 0, 0) === 0);
check('seek clamps below zero', clampMediaSeek(-5, 60) === 0);
check('seek clamps above duration', clampMediaSeek(80, 60) === 60);
check('seek passes through valid value', clampMediaSeek(30, 60) === 30);
check('formats minutes and seconds', formatMediaTime(65) === '01:05');
check('formats hours', formatMediaTime(3661) === '01:01:01');
check('formats invalid time safely', formatMediaTime(Number.NaN) === '00:00');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
