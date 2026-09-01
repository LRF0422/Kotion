import React, { useContext, useEffect, useRef } from 'react';
import type { PageDocumentContent, SpacePageService } from '@kn/common';
import { useNavigator, useSpacePageService, useTranslation } from '@kn/common';
import { PageContext } from '@kn/editor';
import { toast } from '@kn/ui';

export const CREATE_MEETING_PAGE_EVENT = 'kn:create-meeting-page';

export interface CreateMeetingPageDetail {
    spaceId?: string;
    language?: string;
}

export const formatMeetingPageTitle = (date: Date = new Date()): string => {
    const parts = new Intl.DateTimeFormat('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    }).formatToParts(date);
    const value = (type: Intl.DateTimeFormatPartTypes) =>
        parts.find((part) => part.type === type)?.value ?? '';

    return `会议纪要 · ${value('year')}-${value('month')}-${value('day')} ${value('hour')}:${value('minute')}`;
};

export const createMeetingPageContent = (
    title: string,
    language = 'zh-CN',
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
});

export const createMeetingPage = async (
    service: SpacePageService,
    spaceId: string,
    language = 'zh-CN',
) => {
    const title = formatMeetingPageTitle();
    return service.pages.createPage({
        spaceId,
        parentId: '0',
        title,
        tags: ['meeting-minutes'],
        content: createMeetingPageContent(title, language),
    });
};

export const dispatchCreateMeetingPage = (detail: CreateMeetingPageDetail = {}) => {
    window.dispatchEvent(new CustomEvent<CreateMeetingPageDetail>(CREATE_MEETING_PAGE_EVENT, { detail }));
};

/**
 * Always-mounted bridge used by toolbar and slash-menu entry points. Keeping
 * service/navigation access in React avoids coupling editor commands to app
 * routing or the service registry.
 */
export const MeetingPageLauncherBridge: React.FC = () => {
    const pageInfo = useContext(PageContext);
    const service = useSpacePageService();
    const navigator = useNavigator();
    const { i18n, t } = useTranslation();
    const inFlightRef = useRef(false);

    useEffect(() => {
        const handleCreate = async (event: Event) => {
            if (inFlightRef.current) return;
            const detail = (event as CustomEvent<CreateMeetingPageDetail>).detail ?? {};
            const spaceId = detail.spaceId ?? pageInfo.spaceId;
            if (!spaceId) {
                toast.error(t('meetingMinutes.selectSpaceFirst', 'Please select a space first'));
                return;
            }

            inFlightRef.current = true;
            try {
                const language = detail.language ?? (i18n?.language?.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en-US');
                const page = await createMeetingPage(service, spaceId, language);
                navigator.go({ to: `/space-detail/${spaceId}/page/edit/${page.id}` });
            } catch (error) {
                console.error('Failed to create meeting page:', error);
                toast.error(t('meetingMinutes.createFailed', 'Failed to create meeting page'));
            } finally {
                inFlightRef.current = false;
            }
        };

        window.addEventListener(CREATE_MEETING_PAGE_EVENT, handleCreate);
        return () => window.removeEventListener(CREATE_MEETING_PAGE_EVENT, handleCreate);
    }, [i18n?.language, navigator, pageInfo.spaceId, service, t]);

    return null;
};
