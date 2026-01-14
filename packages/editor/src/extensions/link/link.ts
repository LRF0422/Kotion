import { markInputRule } from "@tiptap/core";
import { Link as BuiltInLink } from "@tiptap/extension-link";
import type { MarkConfig } from "@tiptap/core";

/**
 * Extract href from regex match groups
 */
const extractHrefFromMatch = (match: RegExpMatchArray): { href?: string } => {
  return { href: match?.groups?.href };
};

/**
 * Extract href from markdown link syntax [text](url)
 * Removes the last capture group to satisfy tiptap markInputRule expectations
 * @see https://github.com/ueberdosis/tiptap/blob/%40tiptap/core%402.0.0-beta.75/packages/core/src/inputRules/markInputRule.ts#L11
 */
export const extractHrefFromMarkdownLink = (match: RegExpMatchArray): { href?: string } => {
  match.pop();
  return extractHrefFromMatch(match);
};

/**
 * Enhanced URL validation regex patterns
 */
const URL_PATTERNS = {
  // Markdown link syntax: [text](url)
  markdown: /(?:^|\s)\[([\w\s\-\u4e00-\u9fa5]+)\]\((?<href>https?:\/\/[^)]+)\)$/,
  // Direct URL: http(s)://... or www...
  url: /(?:^|\s)(?<href>(?:https?:\/\/|www\.)(?:[a-zA-Z0-9\-._~:/?#[\]@!$&'()*+,;=%])+)(?:\s|\n)$/,
} as const;

/**
 * Custom Link extension with enhanced functionality
 */
export const Link = BuiltInLink.extend({
  addOptions() {
    return {
      ...this.parent?.(),
      openOnClick: false,
      HTMLAttributes: {
        target: '_blank',
        rel: 'noopener noreferrer nofollow',
        class: 'link-extension'
      }
    };
  },

  addInputRules() {
    return [
      markInputRule({
        find: URL_PATTERNS.markdown,
        type: this.type,
        getAttributes: extractHrefFromMarkdownLink
      }),
      markInputRule({
        find: URL_PATTERNS.url,
        type: this.type,
        getAttributes: extractHrefFromMatch
      })
    ];
  },

  addAttributes() {
    return {
      ...this.parent?.(),
      href: {
        default: null,
        parseHTML: (element) => element.getAttribute("href"),
        renderHTML: (attributes) => {
          if (!attributes.href) {
            return {};
          }
          return { href: attributes.href };
        }
      },
      title: {
        default: null,
        parseHTML: (element) => element.getAttribute("title"),
        renderHTML: (attributes) => {
          if (!attributes.title) {
            return {};
          }
          return { title: attributes.title };
        }
      },
      target: {
        default: '_blank',
        parseHTML: (element) => element.getAttribute("target"),
        renderHTML: (attributes) => {
          return { target: attributes.target || '_blank' };
        }
      },
      rel: {
        default: 'noopener noreferrer nofollow',
        parseHTML: (element) => element.getAttribute("rel"),
        renderHTML: (attributes) => {
          return { rel: attributes.rel || 'noopener noreferrer nofollow' };
        }
      }
    };
  }
}).configure({
  openOnClick: false,
  linkOnPaste: true,
  autolink: true,
  protocols: ['http', 'https', 'mailto', 'tel']
});
