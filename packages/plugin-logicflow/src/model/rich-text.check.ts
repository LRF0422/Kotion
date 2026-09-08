import { strict as assert } from "node:assert";
import {
  isAllowedLinkHref,
  sanitizeJSONContent,
  sanitizeRichCardContent,
} from "./rich-text";

assert.equal(isAllowedLinkHref("https://example.com/path"), true);
assert.equal(isAllowedLinkHref("http://example.com"), true);
assert.equal(isAllowedLinkHref("mailto:user@example.com"), true);
assert.equal(isAllowedLinkHref("tel:+123456"), true);
assert.equal(isAllowedLinkHref("/safe/path"), true);
assert.equal(isAllowedLinkHref("#anchor"), true);
assert.equal(isAllowedLinkHref("javascript:alert(1)"), false);
assert.equal(isAllowedLinkHref("data:text/html,bad"), false);
assert.equal(isAllowedLinkHref("//evil.example"), false);

const content = sanitizeJSONContent({
  type: "doc",
  attrs: { unsupported: true },
  content: [
    {
      type: "heading",
      attrs: { level: 99, textAlign: "center", onclick: "bad" },
      content: [
        {
          type: "text",
          text: "Title",
          marks: [
            { type: "bold" },
            { type: "italic" },
            {
              type: "textStyle",
              attrs: {
                fontSize: "18px",
                color: "#123456",
                background: "bad",
              },
            },
          ],
        },
      ],
    },
    {
      type: "paragraph",
      attrs: { textAlign: "right" },
      content: [
        {
          type: "text",
          text: "safe",
          marks: [
            {
              type: "link",
              attrs: {
                href: "https://example.com",
                target: "_blank",
                rel: "bad",
              },
            },
            { type: "unknown" },
          ],
        },
        {
          type: "text",
          text: " unsafe",
          marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }],
        },
        { type: "hardBreak", attrs: { bad: true } },
      ],
    },
    {
      type: "bulletList",
      content: [
        {
          type: "listItem",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "one" }],
            },
          ],
        },
      ],
    },
    { type: "image", attrs: { src: "bad" } },
  ],
});
assert.equal(content.type, "doc");
assert.equal(content.content?.length, 3);
assert.deepEqual(content.content?.[0].attrs, {
  level: 6,
  textAlign: "center",
});
assert.deepEqual(content.content?.[0].content?.[0].marks, [
  { type: "bold" },
  { type: "italic" },
  {
    type: "textStyle",
    attrs: { fontSize: "18px", color: "#123456" },
  },
]);
const safeLink = content.content?.[1].content?.[0].marks?.[0];
assert.deepEqual(safeLink, {
  type: "link",
  attrs: {
    href: "https://example.com",
    target: "_blank",
    rel: "noopener noreferrer",
  },
});
assert.equal(content.content?.[1].content?.[1].marks, undefined);

const card = sanitizeRichCardContent({
  title: {
    type: "paragraph",
    content: [{ type: "text", text: "Card" }],
  },
  body: {
    type: "doc",
    content: [
      {
        type: "orderedList",
        attrs: { start: 3 },
        content: [
          {
            type: "listItem",
            content: [{ type: "paragraph" }],
          },
        ],
      },
    ],
  },
});
assert.equal(card.title.type, "doc");
assert.equal(card.title.content?.[0].type, "paragraph");
assert.deepEqual(card.body.content?.[0].attrs, { start: 3 });

console.log("LogicFlow rich text checks passed.");
