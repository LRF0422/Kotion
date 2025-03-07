import { Node } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { DateView } from "./date-view";
import { CalendarView } from "./calendar-view";


export const Calendar = Node.create({
    name: 'calendar',
    group: 'block',
    inline: false,

    addAttributes() {
        return {
            class: {
                default: 'node-calendar',
                renderHTML() {
                    return {
                        class: 'node-calendar'
                    }
                },
            },
            date: {
                default: null
            }
        }
    },

    addNodeView() {
        return ReactNodeViewRenderer(CalendarView)
    },

    addCommands() {
        return {
            insertCalendar: () => ({ commands }) => {
                return commands.insertContent({
                    type: this.name
                })
            }
        }
    },

    renderHTML({ HTMLAttributes }) {
        return ['div', HTMLAttributes, 0]
    },
    parseHTML() {
        return [
            {
                tag: 'div[class=node-calendar]'
            }
        ]
    },
})