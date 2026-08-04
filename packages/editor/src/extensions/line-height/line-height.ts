import { LineHeight as TiptapLineHeight } from "@tiptap/extension-text-style";

/**
 * Custom LineHeight extension.
 *
 * The upstream extension defaults to `types: ["textStyle"]`, which applies
 * `line-height` as an inline style on a `<span>` mark. That does NOT work in
 * CSS — an inline element's `line-height` cannot shrink the line box below
 * the "strut" created by the parent block element's `line-height` (set to
 * `1.6` on `<p>` by the editor's prose / Tailwind styles).
 *
 * We override `types` to include block-level nodes (`paragraph`, `heading`)
 * and rewrite the commands to use `updateAttributes` on those nodes so that
 * `line-height` is rendered on the `<p>` / `<h1>` element directly.
 */
export const LineHeight = TiptapLineHeight.extend({
    addOptions() {
        return {
            types: ["paragraph", "heading"],
        };
    },

    addCommands() {
        return {
            setLineHeight:
                (lineHeight: string) =>
                ({ chain }: { chain: () => any }) => {
                    return chain()
                        .updateAttributes("paragraph", { lineHeight })
                        .updateAttributes("heading", { lineHeight })
                        .run();
                },
            unsetLineHeight:
                () =>
                ({ chain }: { chain: () => any }) => {
                    return chain()
                        .updateAttributes("paragraph", { lineHeight: null })
                        .updateAttributes("heading", { lineHeight: null })
                        .run();
                },
        };
    },
});
