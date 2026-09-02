import React from 'react'
import type { PageDocumentContent, PageTypeConfig } from '@kn/common'
import { FileAudio } from '@kn/icon'

export const MEETING_MINUTES_PAGE_TYPE_ID = '@kn/plugin-speech-to-text:meeting-minutes'

export const resolveMeetingLanguage = (locale?: string) => {
    const activeLocale = locale ?? (typeof navigator === 'undefined' ? 'zh-CN' : navigator.language)
    return activeLocale.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en-US'
}

export const createMeetingMinutesPageDocument = (
    title: string,
    language = resolveMeetingLanguage(),
    createdAt = Date.now(),
): PageDocumentContent => ({
    type: 'doc',
    content: [
        {
            type: 'title',
            content: [{
                type: 'heading',
                content: [{ type: 'text', text: title }],
            }],
        },
        {
            type: 'meetingMinutes',
            attrs: {
                title,
                attendees: [],
                tags: [],
                lang: language,
                activeTab: 'notes',
                recordingStatus: 'idle',
                summaryStatus: 'idle',
                createdAt,
                updatedAt: createdAt,
            },
            content: [
                {
                    type: 'meetingTabNotes',
                    content: [{ type: 'paragraph' }],
                },
                {
                    type: 'meetingTabSummary',
                    content: [{ type: 'paragraph' }],
                },
                {
                    type: 'meetingTabTranscript',
                    content: [{ type: 'paragraph' }],
                },
            ],
        },
    ],
})

export const meetingMinutesPageType: PageTypeConfig = {
    id: MEETING_MINUTES_PAGE_TYPE_ID,
    label: 'meetingMinutes.pageType',
    description: 'meetingMinutes.pageTypeDescription',
    defaultTitle: 'meetingMinutes.untitledMeeting',
    icon: <FileAudio className="h-4 w-4" />,
    order: 20,
    publicShare: true,
    renderer: {
        type: 'editor-component',
        createInitialDocument: ({ title, locale }) => createMeetingMinutesPageDocument(title, resolveMeetingLanguage(locale)),
    },
}
