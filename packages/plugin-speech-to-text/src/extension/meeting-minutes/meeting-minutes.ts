import { PMNode as Node, ReactNodeViewRenderer, mergeAttributes, CommandProps, RawCommands } from "@kn/editor";
import { MeetingMinutesView } from "./MeetingMinutesView";

declare module "@kn/editor" {
    interface Commands<ReturnType> {
        meetingMinutes: {
            insertMeetingMinutes: (options?: {
                title?: string;
                lang?: string;
            }) => ReturnType;
        };
    }
}

// ─── Child Tab Nodes ────────────────────────────────────
// Each tab is an independent ProseMirror node with its own content.
// The parent meetingMinutes node contains exactly these two children
// (Notes + Transcript), matching Notion's AI Meeting Notes block.
// CSS visibility is controlled by the parent's data-active-tab attribute.

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
    content: "meetingTabNotes meetingTabTranscript",
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
            },
            // Attendees: Array<{ id, name, avatar }> — persisted as JSON.
            attendees: {
                default: [],
                parseHTML: (element: HTMLElement) => {
                    try {
                        return JSON.parse(element.getAttribute('data-attendees') || '[]');
                    } catch {
                        return [];
                    }
                },
                renderHTML: (attributes: Record<string, any>) => {
                    if (!attributes.attendees || attributes.attendees.length === 0) return {};
                    return { 'data-attendees': JSON.stringify(attributes.attendees) };
                },
            },
            // Tags: string[] — persisted as JSON.
            tags: {
                default: [],
                parseHTML: (element: HTMLElement) => {
                    try {
                        return JSON.parse(element.getAttribute('data-tags') || '[]');
                    } catch {
                        return [];
                    }
                },
                renderHTML: (attributes: Record<string, any>) => {
                    if (!attributes.tags || attributes.tags.length === 0) return {};
                    return { 'data-tags': JSON.stringify(attributes.tags) };
                },
            },
            // Speech-recognition language (configurable, defaults to zh-CN).
            lang: {
                default: 'zh-CN',
                parseHTML: (element: HTMLElement) => element.getAttribute('data-lang') || 'zh-CN',
                renderHTML: (attributes: Record<string, any>) => ({ 'data-lang': attributes.lang || 'zh-CN' }),
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
        return ReactNodeViewRenderer(MeetingMinutesView, {
            stopEvent: (eventWrapper) => {
                const event = eventWrapper.event;
                if (event instanceof MouseEvent && event.type === 'mousedown') {
                    return false;
                }
                return true;
            }
        })
    },

    addCommands() {
        return {
            insertMeetingMinutes: (options?: { title?: string; lang?: string }) => ({ chain }: CommandProps) => {
                return chain().insertContent({
                    type: this.name,
                    attrs: {
                        title: options?.title || 'Meeting Minutes',
                        attendees: [],
                        tags: [],
                        lang: options?.lang || 'zh-CN',
                        activeTab: 'notes',
                        createdAt: Date.now(),
                        updatedAt: Date.now()
                    },
                    content: [
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
