import { InputRule, mergeAttributes, Node } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { locateList } from "../../utilities/node";
import { CheckboxView } from "./checkbox-view";

/**
 * Inline, atom checkbox that lives *inside* a paragraph, so a list item can be
 * "• □ text" instead of the bullet being replaced by a checkbox.
 *
 * Typing "[] " / "[ ] " / "[x] " inside a list item turns the marker into this
 * node. Outside a list the shortcut is left to TaskItem's task-list rule, so a
 * plain paragraph still becomes a task list.
 */
export const Checkbox = Node.create({
    name: "checkbox",
    group: "inline",
    inline: true,
    atom: true,
    selectable: true,
    draggable: false,

    addAttributes() {
        return {
            checked: {
                default: false,
                parseHTML: element => element.getAttribute("data-checked") === "true",
                renderHTML: attributes => ({
                    "data-checked": attributes.checked ? "true" : "false",
                }),
            },
        };
    },

    parseHTML() {
        return [{ tag: 'span[data-type="checkbox"]' }];
    },

    renderHTML({ HTMLAttributes }) {
        return ["span", mergeAttributes(HTMLAttributes, { "data-type": "checkbox" })];
    },

    addNodeView() {
        return ReactNodeViewRenderer(CheckboxView);
    },

    addInputRules() {
        const type = this.type;
        return [
            new InputRule({
                find: /^\s*(\[([ xX]?)\])\s$/,
                handler: ({ state, range, match }) => {
                    // Only inside a bullet/ordered list. At the top level
                    // TaskItem's own rule creates a task list, and inside a task
                    // list there is already a checkbox, so stay out of the way.
                    const list = locateList(state.doc, state.selection.$from);
                    if (!list || list.node.type.name === "taskList") return null;

                    const tr = state.tr;
                    const checkbox = type.create({
                        checked: (match[2] || "").toLowerCase() === "x",
                    });
                    // Keep the typed trailing space so text follows the box.
                    tr.replaceWith(range.from, range.to, [
                        checkbox,
                        tr.doc.type.schema.text(" "),
                    ]);
                    return;
                },
            }),
        ];
    },
});
