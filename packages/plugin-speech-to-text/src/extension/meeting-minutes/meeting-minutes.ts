import { PMNode as Node, ReactNodeViewRenderer, mergeAttributes, CommandProps, RawCommands } from "@kn/editor";
import { MeetingMinutesView } from "./MeetingMinutesView";

declare module "@kn/editor" {
    interface Commands<ReturnType> {
        meetingMinutes: {
            insertMeetingMinutes: (options?: {
                title?: string;
            }) => ReturnType;
        };
    }
}

// ─── Child Tab Nodes ────────────────────────────────────
// Each tab is an independent ProseMirror node with its own content.
// The parent meetingMinutes node contains exactly these three children.
// CSS visibility is controlled by the parent's data-active-tab attribute.

export const MeetingTabSummaryNode = Node.create({
    name: "meetingTabSummary",
    group: "block",
    content: "block+",
    inline: false,
    defining: true,
    isolating: true,

    parseHTML() {
        return [{ tag: 'div[data-tab="summary"]' }];
    },

    renderHTML({ HTMLAttributes }) {
        return ['div', mergeAttributes(HTMLAttributes, { 'data-tab': 'summary', class: 'meeting-tab-content' }), 0];
    },
});

export const MeetingTabNotesNode = Node.create({
    name: "meetingTabNotes",
    group: "block",
    content: "block+",
    inline: false,
    defining: true,
    isolating: true,

    parseHTML() {
        return [{ tag: 'div[data-tab="notes"]' }];
    },

    renderHTML({ HTMLAttributes }) {
        return ['div', mergeAttributes(HTMLAttributes, { 'data-tab': 'notes', class: 'meeting-tab-content' }), 0];
    },
});

export const MeetingTabTranscriptNode = Node.create({
    name: "meetingTabTranscript",
    group: "block",
    content: "block+",
    inline: false,
    defining: true,
    isolating: true,

    parseHTML() {
        return [{ tag: 'div[data-tab="transcript"]' }];
    },

    renderHTML({ HTMLAttributes }) {
        return ['div', mergeAttributes(HTMLAttributes, { 'data-tab': 'transcript', class: 'meeting-tab-content' }), 0];
    },
});

// ─── Parent Node ────────────────────────────────────────

export const MeetingMinutesNode = Node.create({
    name: "meetingMinutes",
    group: "block",
    content: "meetingTabSummary meetingTabNotes meetingTabTranscript",
    inline: false,
    draggable: true,
    isolating: true,

    addOptions() {
        return {
            HTMLAttributes: {}
        };
    },

    addAttributes() {
        return {
            // Recording state
            isRecording: {
                default: false
            },
            isPaused: {
                default: false
            },
            duration: {
                default: 0
            },
            // Audio data
            audioPath: {
                default: null
            },
            audioUrl: {
                default: null
            },
            // Transcription (raw transcript text, stored as attribute for reference)
            transcript: {
                default: ''
            },
            // Active tab
            activeTab: {
                default: 'notes'
            },
            // Metadata
            title: {
                default: ''
            },
            createdAt: {
                default: null
            },
            updatedAt: {
                default: null
            }
        }
    },

    parseHTML() {
        return [
            {
                tag: 'div[data-type="meeting-minutes"]'
            }
        ];
    },

    renderHTML({ HTMLAttributes }) {
        return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'meeting-minutes' }), 0]
    },

    addNodeView() {
        return ReactNodeViewRenderer(MeetingMinutesView)
    },

    addCommands() {
        return {
            insertMeetingMinutes: (options?: { title?: string }) => ({ chain }: CommandProps) => {
                return chain().insertContent({
                    type: this.name,
                    attrs: {
                        title: options?.title || 'Meeting Minutes',
                        createdAt: Date.now(),
                        updatedAt: Date.now()
                    },
                    content: [
                        {
                            type: 'meetingTabSummary',
                            content: [{ type: 'paragraph' }]
                        },
                        {
                            type: 'meetingTabNotes',
                            content: [{ type: 'paragraph' }]
                        },
                        {
                            type: 'meetingTabTranscript',
                            content: [{ type: 'paragraph' }]
                        }
                    ]
                }).run()
            }
        } as Partial<RawCommands>
    }
});
