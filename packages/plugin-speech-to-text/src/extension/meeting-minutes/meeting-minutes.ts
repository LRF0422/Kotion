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

export const MeetingMinutesNode = Node.create({
    name: "meetingMinutes",
    group: "block",
    content: "block+",
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
                default: 'summary'
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
                        title: options?.title || '会议纪要',
                        createdAt: Date.now(),
                        updatedAt: Date.now()
                    },
                    content: [
                        {
                            type: 'paragraph'
                        }
                    ]
                }).run()
            }
        } as Partial<RawCommands>
    }
});
