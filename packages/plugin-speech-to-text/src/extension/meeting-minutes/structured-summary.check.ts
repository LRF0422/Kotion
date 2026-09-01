import { strict as assert } from 'node:assert';
import {
    parseStructuredMeetingSummary,
    plainTextToTiptapNodes,
    structuredSummaryToTiptapNodes,
} from './structured-summary.js';

const parsed = parseStructuredMeetingSummary(`Here is the result:\n\n\`\`\`json
{
  "title": "Weekly sync",
  "overview": "Reviewed launch readiness.",
  "keyPoints": ["QA is nearly complete"],
  "decisions": ["Ship on Friday"],
  "actionItems": [{"task": "Close remaining bugs", "owner": "Ada", "dueDate": "Thursday"}]
}
\`\`\``);
assert.equal(parsed.title, 'Weekly sync');
assert.equal(parsed.actionItems[0].owner, 'Ada');

const nodes = structuredSummaryToTiptapNodes(parsed);
assert.equal(nodes[0].type, 'heading');
assert.ok(nodes.some((node) => node.type === 'bulletList'));
assert.equal(JSON.stringify(nodes).includes('Close remaining bugs (Owner: Ada · Due: Thursday)'), true);

assert.deepEqual(plainTextToTiptapNodes('first\n\nthird'), [
    { type: 'paragraph', content: [{ type: 'text', text: 'first' }] },
    { type: 'paragraph' },
    { type: 'paragraph', content: [{ type: 'text', text: 'third' }] },
]);

assert.throws(() => parseStructuredMeetingSummary('{"unexpected": true}'));
assert.throws(() => parseStructuredMeetingSummary('not json'));

console.log('structured meeting summary checks passed');
