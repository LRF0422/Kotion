import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { PageSummary, Space } from '@kn/common';
import { useNavigator, useSpacePageService, useTranslation } from '@kn/common';
import { Button, toast } from '@kn/ui';
import { FileAudio, Loader2, Plus } from '@kn/icon';
import { createMeetingPage } from '../meeting-page';

export const MeetingMinutesHome: React.FC = () => {
    const service = useSpacePageService();
    const navigator = useNavigator();
    const { i18n, t } = useTranslation();
    const [spaces, setSpaces] = useState<Space[]>([]);
    const [meetings, setMeetings] = useState<PageSummary[]>([]);
    const [spaceId, setSpaceId] = useState('');
    const [loading, setLoading] = useState(true);
    const [creating, setCreating] = useState(false);

    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            setLoading(true);
            try {
                const [spaceResult, meetingResult] = await Promise.all([
                    service.spaces.querySpaces({ pageSize: 100, archived: false }),
                    service.pages.queryPages({ pageSize: 50, tags: ['meeting-minutes'] }),
                ]);
                if (cancelled) return;
                setSpaces(spaceResult.records);
                setMeetings(meetingResult.records);
                setSpaceId((current) => current || spaceResult.records[0]?.id || '');
            } catch (error) {
                console.error('Failed to load meeting minutes home:', error);
                toast.error(t('meetingMinutes.loadFailed', 'Failed to load meeting minutes'));
            } finally {
                if (!cancelled) setLoading(false);
            }
        };
        void load();
        return () => { cancelled = true; };
    }, [service, t]);

    const selectedSpace = useMemo(
        () => spaces.find((space) => space.id === spaceId),
        [spaceId, spaces],
    );

    const visibleMeetings = useMemo(
        () => spaceId ? meetings.filter((meeting) => meeting.spaceId === spaceId) : meetings,
        [meetings, spaceId],
    );

    const handleCreate = useCallback(async () => {
        if (!spaceId || creating) return;
        setCreating(true);
        try {
            const language = i18n?.language?.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en-US';
            const page = await createMeetingPage(service, spaceId, language);
            navigator.go({ to: `/space-detail/${spaceId}/page/edit/${page.id}` });
        } catch (error) {
            console.error('Failed to create meeting page:', error);
            toast.error(t('meetingMinutes.createFailed', 'Failed to create meeting page'));
        } finally {
            setCreating(false);
        }
    }, [creating, i18n?.language, navigator, service, spaceId, t]);

    return (
        <main className="h-full overflow-y-auto bg-background">
            <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-6 py-8 lg:px-10">
                <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                        <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                            <FileAudio className="h-5 w-5" />
                        </div>
                        <h1 className="text-2xl font-semibold tracking-tight">
                            {t('meetingMinutes.title', 'Meeting Minutes')}
                        </h1>
                        <p className="mt-1 text-sm text-muted-foreground">
                            {t('meetingMinutes.homeDescription', 'Create one page per meeting and keep recordings organized automatically.')}
                        </p>
                    </div>
                    <Button onClick={handleCreate} disabled={!spaceId || creating} className="gap-2">
                        {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                        {t('meetingMinutes.newMeeting', 'New meeting')}
                    </Button>
                </header>

                <section className="rounded-xl border bg-card p-4 shadow-sm">
                    <label className="mb-2 block text-xs font-medium text-muted-foreground" htmlFor="meeting-space">
                        {t('meetingMinutes.space', 'Space')}
                    </label>
                    <select
                        id="meeting-space"
                        value={spaceId}
                        onChange={(event) => setSpaceId(event.target.value)}
                        className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring sm:max-w-sm"
                    >
                        {spaces.map((space) => (
                            <option key={space.id} value={space.id}>{space.name}</option>
                        ))}
                    </select>
                    {selectedSpace && (
                        <p className="mt-2 text-xs text-muted-foreground">
                            {t('meetingMinutes.recordingFolderHint', 'Recordings are saved to the fixed meeting folder for this space.')}
                        </p>
                    )}
                </section>

                <section>
                    <div className="mb-3 flex items-center justify-between">
                        <h2 className="text-sm font-semibold">
                            {t('meetingMinutes.recentMeetings', 'Recent meetings')}
                        </h2>
                        <span className="text-xs text-muted-foreground">{visibleMeetings.length}</span>
                    </div>

                    {loading ? (
                        <div className="flex items-center justify-center rounded-xl border py-16 text-muted-foreground">
                            <Loader2 className="h-5 w-5 animate-spin" />
                        </div>
                    ) : visibleMeetings.length === 0 ? (
                        <div className="rounded-xl border border-dashed px-6 py-14 text-center">
                            <FileAudio className="mx-auto h-8 w-8 text-muted-foreground/50" />
                            <p className="mt-3 text-sm font-medium">
                                {t('meetingMinutes.noMeetings', 'No meetings yet')}
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground">
                                {t('meetingMinutes.noMeetingsDescription', 'Create a meeting page to start recording and taking notes.')}
                            </p>
                        </div>
                    ) : (
                        <div className="grid gap-2">
                            {visibleMeetings.map((meeting) => (
                                <button
                                    key={meeting.id}
                                    type="button"
                                    onClick={() => navigator.go({ to: `/space-detail/${meeting.spaceId ?? spaceId}/page/edit/${meeting.id}` })}
                                    className="flex min-h-12 items-center gap-3 rounded-lg border bg-card px-4 py-3 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                >
                                    <FileAudio className="h-4 w-4 shrink-0 text-muted-foreground" />
                                    <span className="min-w-0 flex-1 truncate text-sm font-medium">
                                        {meeting.title || t('meetingMinutes.untitledMeeting', 'Untitled meeting')}
                                    </span>
                                </button>
                            ))}
                        </div>
                    )}
                </section>
            </div>
        </main>
    );
};
