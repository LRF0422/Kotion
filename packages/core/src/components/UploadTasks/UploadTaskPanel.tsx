import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import {
    Button,
    Popover,
    PopoverContent,
    PopoverTrigger,
    Progress,
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    cn,
    useResponsive,
} from '@kn/ui';
import {
    CheckCircle2,
    ChevronDown,
    ChevronUp,
    FileUp,
    Loader2,
    Pause,
    Play,
    RotateCcw,
    Trash2,
    UploadCloud,
    X,
} from '@kn/icon';
import {
    fileOpen,
    useTranslation,
    useUploadTaskService,
    type UploadFileHandle,
    type UploadTask,
    type UploadTaskService,
    type UploadTaskSnapshot,
} from '@kn/common';

const formatBytes = (bytes: number): string => {
    if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    const value = bytes / 1024 ** index;
    return `${value >= 10 || index === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[index]}`;
};

type Translate = (key: string) => string;

const TaskRow: React.FC<{ task: UploadTask; service: UploadTaskService; t: Translate }> = ({ task, service, t }) => {
    const canPause = task.status === 'UPLOADING';
    const canResume = ['PAUSED', 'WAITING_FOR_NETWORK', 'NEEDS_PERMISSION'].includes(task.status);
    const canRetry = task.status === 'FAILED' && task.retryable;
    const canCancel = !['FINALIZING', 'COMPLETED', 'CANCELLED', 'CANCELLING'].includes(task.status);
    const canClear = task.status === 'COMPLETED' || task.status === 'CANCELLED'
        || (task.status === 'FAILED' && !task.retryable);

    const reselect = async () => {
        try {
            const selected = await fileOpen({ multiple: false });
            const file = (Array.isArray(selected) ? selected[0] : selected) as (File & { handle?: UploadFileHandle }) | undefined;
            if (file) await service.reselect(task.id, { file, handle: file.handle });
        } catch (error) {
            if (!(error instanceof DOMException) || error.name !== 'AbortError') throw error;
        }
    };

    return (
        <div className="w-full min-w-0 space-y-1.5 overflow-hidden border-b px-3 py-2 last:border-b-0">
            <div className="flex min-w-0 items-start gap-2 overflow-hidden">
                <div className={cn(
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                    task.status === 'COMPLETED'
                        ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                        : "bg-primary/10 text-primary",
                )}>
                    {task.status === 'COMPLETED'
                        ? <CheckCircle2 className="h-4 w-4" />
                        : <FileUp className="h-4 w-4" />}
                </div>
                <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium" title={task.name}>{task.name}</p>
                    <div className="mt-0.5 flex min-w-0 items-center gap-x-2 overflow-hidden whitespace-nowrap text-[11px] text-muted-foreground">
                        <span className={cn(task.status === 'COMPLETED' && "font-medium text-emerald-600 dark:text-emerald-400")}>
                            {t(`uploadTasks.status.${task.status}`)}
                        </span>
                        <span>{formatBytes(task.uploadedBytes)} / {formatBytes(task.size)}</span>
                    </div>
                    {task.errorMessage && (
                        <p className="mt-0.5 truncate text-[11px] text-destructive" title={task.errorMessage}>
                            {task.errorMessage}
                        </p>
                    )}
                </div>
                <div className="flex shrink-0 items-center">
                    {canPause && (
                        <Button variant="ghost" size="icon" className="h-11 w-11 lg:h-8 lg:w-8" onClick={() => service.pause(task.id)} aria-label={t('uploadTasks.pause')}>
                            <Pause className="h-4 w-4" />
                        </Button>
                    )}
                    {canResume && (
                        <Button variant="ghost" size="icon" className="h-11 w-11 lg:h-8 lg:w-8" onClick={() => void service.resume(task.id)} aria-label={t('uploadTasks.resume')}>
                            <Play className="h-4 w-4" />
                        </Button>
                    )}
                    {canRetry && (
                        <Button variant="ghost" size="icon" className="h-11 w-11 lg:h-8 lg:w-8" onClick={() => void service.retry(task.id)} aria-label={t('uploadTasks.retry')}>
                            <RotateCcw className="h-4 w-4" />
                        </Button>
                    )}
                    {task.status === 'NEEDS_RESELECT' && (
                        <Button variant="ghost" size="icon" className="h-11 w-11 lg:h-8 lg:w-8" onClick={() => void reselect()} aria-label={t('uploadTasks.reselect')}>
                            <FileUp className="h-4 w-4" />
                        </Button>
                    )}
                    {canCancel && (
                        <Button variant="ghost" size="icon" className="h-11 w-11 text-muted-foreground hover:text-destructive lg:h-8 lg:w-8" onClick={() => void service.cancel(task.id)} aria-label={t('uploadTasks.cancel')}>
                            <X className="h-4 w-4" />
                        </Button>
                    )}
                    {canClear && (
                        <Button variant="ghost" size="icon" className="h-11 w-11 text-muted-foreground lg:h-8 lg:w-8" onClick={() => service.clear(task.id)} aria-label={t('uploadTasks.clear')}>
                            <Trash2 className="h-4 w-4" />
                        </Button>
                    )}
                </div>
            </div>
            <Progress
                className={cn("h-1", task.status === 'COMPLETED' && "[&>div]:bg-emerald-500")}
                value={task.progress}
                aria-label={`${task.name} ${Math.round(task.progress)}%`}
            />
        </div>
    );
};

const TaskPanelContent: React.FC<{
    service: UploadTaskService;
    snapshot: UploadTaskSnapshot;
    t: Translate;
    onMinimize?: () => void;
}> = ({ service, snapshot, t, onMinimize }) => (
        <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden">
            <div className="shrink-0 space-y-1.5 border-b px-3 py-2.5">
                <div className="flex items-center gap-2">
                    {snapshot.tasks.length > 0 && snapshot.tasks.every((task) => task.status === 'COMPLETED')
                        ? <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                        : <UploadCloud className="h-5 w-5 text-primary" />}
                    <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold">{t('uploadTasks.title')}</p>
                        <p className="text-xs text-muted-foreground">
                            {snapshot.completedCount}/{snapshot.tasks.length} · {Math.round(snapshot.progress)}%
                        </p>
                    </div>
                    {snapshot.tasks.some((task) => task.status === 'PAUSED') && (
                        <Button variant="ghost" size="sm" className="h-11 lg:h-8" onClick={() => snapshot.tasks.filter((task) => task.status === 'PAUSED').forEach((task) => void service.resume(task.id))}>
                            {t('uploadTasks.resumeAll')}
                        </Button>
                    )}
                    <Button variant="ghost" size="icon" className="h-11 w-11 lg:h-8 lg:w-8" onClick={onMinimize} aria-label={t('uploadTasks.minimize')}>
                        <ChevronDown className="h-4 w-4" />
                    </Button>
                </div>
                <Progress className="h-1" value={snapshot.progress} aria-label={t('uploadTasks.overallProgress')} />
            </div>
            <div className="min-h-0 max-h-[300px] flex-1 overflow-x-hidden overflow-y-auto">
                {snapshot.tasks.map((task) => <TaskRow key={task.id} task={task} service={service} t={t} />)}
            </div>
            {(snapshot.completedCount > 0 || snapshot.tasks.some((task) =>
                task.status === 'CANCELLED' || (task.status === 'FAILED' && !task.retryable))) && (
                <div className="shrink-0 border-t px-2 py-1 text-right">
                    <Button variant="ghost" size="sm" className="h-11 lg:h-8" onClick={() => service.clearTerminal()}>
                        {t('uploadTasks.clearCompleted')}
                    </Button>
                </div>
            )}
        </div>
    );

export const UploadTaskPanel: React.FC = () => {
    const service = useUploadTaskService();
    const subscribe = React.useCallback((listener: () => void) => service.subscribe(listener), [service]);
    const getSnapshot = React.useCallback(() => service.getSnapshot(), [service]);
    const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
    const { t } = useTranslation();
    const translate = React.useCallback<Translate>((key) => t(key), [t]);
    const { isMobile, isDesktop } = useResponsive();
    const [minimized, setMinimized] = useState(false);
    const [mobileOpen, setMobileOpen] = useState(false);
    const [desktopOpen, setDesktopOpen] = useState(false);
    const [toolbarSlot, setToolbarSlot] = useState<HTMLElement | null>(null);

    useEffect(() => {
        const resolveToolbarSlot = () => {
            const slots = Array.from(document.querySelectorAll<HTMLElement>('[data-file-manager-upload-task-slot]'))
                .filter((slot) => slot.isConnected);
            const dialogSlot = [...slots].reverse().find((slot) => slot.closest('[role="dialog"]'));
            const nextSlot = dialogSlot ?? slots[slots.length - 1] ?? null;
            setToolbarSlot((currentSlot) => currentSlot === nextSlot ? currentSlot : nextSlot);
        };

        resolveToolbarSlot();
        const observer = new MutationObserver(resolveToolbarSlot);
        observer.observe(document.body, { childList: true, subtree: true });
        return () => observer.disconnect();
    }, []);

    const allCompleted = snapshot.tasks.length > 0
        && snapshot.tasks.every((task) => task.status === 'COMPLETED');

    if (!snapshot.initialized || snapshot.tasks.length === 0) return null;

    if (isMobile) {
        return (
            <>
                <Button
                    type="button"
                    onClick={() => setMobileOpen(true)}
                    className={cn(
                        "fixed bottom-safe-bottom right-safe-right z-40 mb-20 mr-3 h-12 max-w-[calc(100vw-1.5rem)] gap-2 rounded-full px-4 shadow-lg transition-[opacity,transform] duration-200 motion-reduce:transition-none",
                        mobileOpen && "pointer-events-none translate-y-2 scale-95 opacity-0",
                        allCompleted && "bg-emerald-600 text-white hover:bg-emerald-600/90",
                    )}
                >
                    {allCompleted ? <CheckCircle2 className="h-4 w-4" /> : <UploadCloud className="h-4 w-4" />}
                    <span>{allCompleted
                        ? translate('uploadTasks.uploadComplete')
                        : snapshot.activeCount > 0 ? `${Math.round(snapshot.progress)}%` : translate('uploadTasks.title')}</span>
                    <ChevronUp className="h-4 w-4" />
                </Button>
                <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
                    <SheetContent side="bottom" className="flex max-h-[82dvh] min-h-[45dvh] flex-col gap-0 rounded-t-2xl p-0 pb-safe">
                        <SheetHeader className="sr-only"><SheetTitle>{translate('uploadTasks.title')}</SheetTitle></SheetHeader>
                        <TaskPanelContent service={service} snapshot={snapshot} t={translate} onMinimize={() => setMobileOpen(false)} />
                    </SheetContent>
                </Sheet>
            </>
        );
    }

    const toolbarTarget = isDesktop ? toolbarSlot : null;
    if (toolbarTarget) {
        return createPortal(
            <Popover open={desktopOpen} onOpenChange={setDesktopOpen}>
                <PopoverTrigger asChild>
                    <Button
                        type="button"
                        variant="secondary"
                        className={cn(
                            "h-8 min-w-[160px] max-w-[190px] gap-1.5 rounded-md px-2.5 shadow-none transition-colors duration-150 motion-reduce:transition-none",
                            allCompleted && "bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-300",
                        )}
                    >
                        {allCompleted
                            ? <CheckCircle2 className="h-4 w-4 shrink-0" />
                            : <Loader2 className="h-4 w-4 shrink-0 animate-spin motion-reduce:animate-none" />}
                        <span className="min-w-0 flex-1 truncate text-left">
                            {allCompleted
                                ? translate('uploadTasks.uploadComplete')
                                : translate('uploadTasks.upload')}
                        </span>
                        {!allCompleted && (
                            <span className="shrink-0 tabular-nums">· {Math.round(snapshot.progress)}%</span>
                        )}
                        <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 transition-transform duration-150", desktopOpen && "rotate-180")} />
                    </Button>
                </PopoverTrigger>
                <PopoverContent
                    align="end"
                    sideOffset={8}
                    className="flex max-h-[420px] w-[360px] max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-xl p-0 shadow-2xl"
                >
                    <TaskPanelContent service={service} snapshot={snapshot} t={translate} onMinimize={() => setDesktopOpen(false)} />
                </PopoverContent>
            </Popover>,
            toolbarTarget,
        );
    }

    const minimizedButton = (
        <Button
            type="button"
            variant={toolbarTarget ? "secondary" : "default"}
            onClick={() => setMinimized(false)}
            tabIndex={minimized ? 0 : -1}
            aria-hidden={!minimized}
            className={cn(
                "gap-2 transition-[opacity,transform] duration-200 ease-out motion-reduce:transition-none",
                toolbarTarget
                    ? "h-8 w-full justify-between rounded-md px-2.5 shadow-none"
                    : "fixed bottom-safe-bottom right-safe-right z-40 mb-3 mr-3 h-11 rounded-full px-4 shadow-lg",
                minimized
                    ? "translate-y-0 scale-100 opacity-100"
                    : "pointer-events-none translate-y-2 scale-95 opacity-0",
                allCompleted && "bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-300",
            )}
        >
            {allCompleted
                ? <CheckCircle2 className="h-4 w-4 shrink-0" />
                : <UploadCloud className="h-4 w-4 shrink-0" />}
            <span className="min-w-0 flex-1 truncate text-left">
                {allCompleted
                    ? translate('uploadTasks.uploadComplete')
                    : `${translate('uploadTasks.upload')} · ${Math.round(snapshot.progress)}%`}
            </span>
            <ChevronUp className="h-4 w-4 shrink-0" />
        </Button>
    );

    return (
        <>
            {toolbarTarget ? createPortal(minimizedButton, toolbarTarget) : minimizedButton}

            <section
                className={cn(
                    "fixed bottom-safe-bottom right-safe-right z-40 mb-3 mr-3 flex max-h-[420px] w-[360px] max-w-[calc(100vw-1.5rem)] origin-bottom-right flex-col overflow-hidden rounded-xl border bg-background shadow-2xl transition-[opacity,transform] duration-200 ease-out motion-reduce:transition-none",
                    minimized
                        ? "pointer-events-none translate-y-3 scale-95 opacity-0"
                        : "translate-y-0 scale-100 opacity-100",
                )}
                aria-hidden={minimized}
                aria-label={translate('uploadTasks.title')}
            >
                <TaskPanelContent service={service} snapshot={snapshot} t={translate} onMinimize={() => setMinimized(true)} />
            </section>
        </>
    );
};
