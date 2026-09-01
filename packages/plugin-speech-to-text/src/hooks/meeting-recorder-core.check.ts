import { strict as assert } from 'node:assert';
import {
    initialMeetingRecorderState,
    meetingRecorderReducer,
    negotiateMeetingAudioMimeType,
} from './meeting-recorder-core.js';

let state = meetingRecorderReducer(initialMeetingRecorderState, { type: 'requestPermission' });
assert.equal(state.status, 'requestingPermission');
state = meetingRecorderReducer(state, { type: 'started', mimeType: 'audio/mp4' });
assert.equal(state.status, 'recording');
state = meetingRecorderReducer(state, { type: 'duration', seconds: 8 });
state = meetingRecorderReducer(state, { type: 'duration', seconds: 3 });
assert.equal(state.duration, 8, 'duration must never move backwards');
state = meetingRecorderReducer(state, { type: 'paused' });
assert.equal(state.status, 'paused');
state = meetingRecorderReducer(state, { type: 'resumed' });
assert.equal(state.status, 'recording');
state = meetingRecorderReducer(state, { type: 'stopping' });
assert.equal(state.status, 'stopping');
state = meetingRecorderReducer(state, {
    type: 'captured',
    audioBlob: new Blob(['audio'], { type: 'audio/mp4' }),
    transcript: 'final transcript',
    mimeType: 'audio/mp4',
    duration: 7,
});
assert.equal(state.status, 'captured');
assert.equal(state.duration, 8, 'capture duration must remain monotonic');
assert.equal(state.transcript, 'final transcript');

const tested: string[] = [];
const selected = negotiateMeetingAudioMimeType((mimeType) => {
    tested.push(mimeType);
    return mimeType === 'audio/mp4';
});
assert.equal(selected, 'audio/mp4');
assert.deepEqual(tested, [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4;codecs=mp4a.40.2',
    'audio/mp4',
]);
assert.equal(negotiateMeetingAudioMimeType(() => false), '');
assert.equal(negotiateMeetingAudioMimeType(undefined), '');

console.log('meeting recorder core checks passed');
