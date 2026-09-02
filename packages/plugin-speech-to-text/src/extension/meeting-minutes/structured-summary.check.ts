import { strict as assert } from 'node:assert';
import {
    createMeetingContentFingerprint,
    parseStructuredMeetingMinutes,
    plainTextToTiptapNodes,
    structuredNotesToTiptapNodes,
    structuredSummaryToTiptapNodes,
} from './structured-summary.js';

const parsed = parseStructuredMeetingMinutes(`Here is the result:\n\n\`\`\`json
{
  "title": "Weekly sync",
  "notes": [
    {
      "heading": "Launch readiness",
      "details": ["QA is nearly complete", "The remaining bugs are being triaged"]
    }
  ],
  "overview": "Reviewed launch readiness.",
  "keyPoints": ["QA is nearly complete"],
  "decisions": ["Ship on Friday"],
  "actionItems": [{"task": "Close remaining bugs", "owner": "Ada", "dueDate": "Thursday"}]
}
\`\`\``);
assert.equal(parsed.title, 'Weekly sync');
assert.equal(parsed.notes[0].heading, 'Launch readiness');
assert.equal(parsed.notes[0].details.length, 2);
assert.equal(parsed.actionItems[0].owner, 'Ada');

const noteNodes = structuredNotesToTiptapNodes(parsed.notes);
assert.equal(noteNodes[0].type, 'heading');
assert.equal(noteNodes[1].type, 'bulletList');
assert.equal(JSON.stringify(noteNodes).includes('The remaining bugs are being triaged'), true);

const summaryNodes = structuredSummaryToTiptapNodes(parsed);
assert.equal(summaryNodes[0].type, 'heading');
assert.ok(summaryNodes.some((node) => node.type === 'bulletList'));
assert.equal(JSON.stringify(summaryNodes).includes('Close remaining bugs (Owner: Ada · Due: Thursday)'), true);

assert.deepEqual(plainTextToTiptapNodes('first\n\nthird'), [
    { type: 'paragraph', content: [{ type: 'text', text: 'first' }] },
    { type: 'paragraph' },
    { type: 'paragraph', content: [{ type: 'text', text: 'third' }] },
]);

assert.throws(() => parseStructuredMeetingMinutes(`{
    "overview": "Summary only",
    "keyPoints": [],
    "decisions": [],
    "actionItems": []
}`));
assert.throws(() => parseStructuredMeetingMinutes(`{
    "notes": [{"heading": "Topic", "details": ["Detail"]}],
    "overview": "",
    "keyPoints": [],
    "decisions": [],
    "actionItems": []
}`));
assert.throws(() => parseStructuredMeetingMinutes(`{
    "notes": [{"heading": "Topic", "details": "Detail"}],
    "overview": "Summary",
    "keyPoints": [],
    "decisions": [],
    "actionItems": []
}`));
assert.throws(() => parseStructuredMeetingMinutes(`{
    "notes": [{"heading": "Topic", "details": ["Detail"]}],
    "overview": "Summary",
    "keyPoints": "Point",
    "decisions": [],
    "actionItems": []
}`));
assert.throws(() => parseStructuredMeetingMinutes('not json'));

const generatedContent = [
    { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Topic' }] },
    { type: 'paragraph', content: [{ type: 'text', text: 'Detail' }] },
];
assert.equal(
    createMeetingContentFingerprint(generatedContent),
    createMeetingContentFingerprint([
        { content: [{ text: 'Topic', type: 'text' }], attrs: { level: 3 }, type: 'heading' },
        { content: [{ text: 'Detail', type: 'text' }], type: 'paragraph' },
    ]),
);
assert.notEqual(
    createMeetingContentFingerprint(generatedContent),
    createMeetingContentFingerprint([
        ...generatedContent,
        { type: 'paragraph', content: [{ type: 'text', text: 'Edited' }] },
    ]),
);
