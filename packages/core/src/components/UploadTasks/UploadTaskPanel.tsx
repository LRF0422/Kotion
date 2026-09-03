import React, { useState, useSyncExternalStore } from 'react';
import {
    Button,
    Progress,
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    cn,
    useResponsive,
} from '@kn/ui';
import {
    ChevronDown,
    ChevronUp,
    FileUp,
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

const statusLabel = (task: UploadTask, zh: boolean): string => {
    const labels: Record<UploadTask['status'], [string, string]> = {
        QUEUED: ['等待上传', 'Queued'],
        CHECKSUMMING: ['正在校验', 'Checking'],
        UPLOADING: ['正在上传', 'Uploading'],
        PAUSED: ['已暂停', 'Paused'],
        WAITING_FOR_NETWORK: ['等待网络', 'Waiting for network'],
        NEEDS_PERMISSION: ['需要文件权限', 'Permission required'],
        NEEDS_RESELECT: ['需要重新选择文件', 'File re-selection required'],
        FINALIZING: ['正在完成', 'Finalizing'],
        COMPLETED: ['上传完成', 'Completed'],
        FAILED: ['上传失败', 'Failed'],
        CANCELLING: ['正在取消', 'Cancelling'],
        CANCELLED: ['已取消', 'Cancelled'],
    };
    return labels[task.status][zh ? 0 : 1];
};

const TaskRow: React.FC<{ task: UploadTask; zh: boolean; service: UploadTaskService }> = ({ task, zh, service }) => {
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
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <FileUp className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium" title={task.name}>{task.name}</p>
                    <div className="mt-0.5 flex min-w-0 items-center gap-x-2 overflow-hidden whitespace-nowrap text-[11px] text-muted-foreground">
                        <span>{statusLabel(task, zh)}</span>
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
                        <Button variant="ghost" size="icon" className="h-11 w-11 lg:h-8 lg:w-8" onClick={() => service.pause(task.id)} aria-label={zh ? '暂停' : 'Pause'}>
                            <Pause className="h-4 w-4" />
                        </Button>
                    )}
                    {canResume && (
                        <Button variant="ghost" size="icon" className="h-11 w-11 lg:h-8 lg:w-8" onClick={() => void service.resume(task.id)} aria-label={zh ? '继续' : 'Resume'}>
                            <Play className="h-4 w-4" />
                        </Button>
                    )}
                    {canRetry && (
                        <Button variant="ghost" size="icon" className="h-11 w-11 lg:h-8 lg:w-8" onClick={() => void service.retry(task.id)} aria-label={zh ? '重试' : 'Retry'}>
                            <RotateCcw className="h-4 w-4" />
                        </Button>
                    )}
                    {task.status === 'NEEDS_RESELECT' && (
                        <Button variant="ghost" size="icon" className="h-11 w-11 lg:h-8 lg:w-8" onClick={() => void reselect()} aria-label={zh ? '重新选择文件' : 'Reselect file'}>
                            <FileUp className="h-4 w-4" />
                        </Button>
                    )}
                    {canCancel && (
                        <Button variant="ghost" size="icon" className="h-11 w-11 text-muted-foreground hover:text-destructive lg:h-8 lg:w-8" onClick={() => void service.cancel(task.id)} aria-label={zh ? '取消上传' : 'Cancel upload'}>
                            <X className="h-4 w-4" />
                        </Button>
                    )}
                    {canClear && (
                        <Button variant="ghost" size="icon" className="h-11 w-11 text-muted-foreground lg:h-8 lg:w-8" onClick={() => service.clear(task.id)} aria-label={zh ? '清除记录' : 'Clear'}>
                            <Trash2 className="h-4 w-4" />
                        </Button>
                    )}
                </div>
            </div>
            <Progress className="h-1" value={task.progress} aria-label={`${task.name} ${Math.round(task.progress)}%`} />
        </div>
    );
};

const TaskPanelContent: React.FC<{
    zh: boolean;
    service: UploadTaskService;
    snapshot: UploadTaskSnapshot;
    onMinimize?: () => void;
}> = ({ zh, service, snapshot, onMinimize }) => (
        <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden">
            <div className="shrink-0 space-y-1.5 border-b px-3 py-2.5">
                <div className="flex items-center gap-2">
                    <UploadCloud className="h-5 w-5 text-primary" />
                    <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold">{zh ? '上传任务' : 'Uploads'}</p>
                        <p className="text-xs text-muted-foreground">
                            {snapshot.completedCount}/{snapshot.tasks.length} · {Math.round(snapshot.progress)}%
                        </p>
                    </div>
                    {snapshot.tasks.some((task) => task.status === 'PAUSED') && (
                        <Button variant="ghost" size="sm" className="h-11 lg:h-8" onClick={() => snapshot.tasks.filter((task) => task.status === 'PAUSED').forEach((task) => void service.resume(task.id))}>
                            {zh ? '全部继续' : 'Resume all'}
                        </Button>
                    )}
                    <Button variant="ghost" size="icon" className="h-11 w-11 lg:h-8 lg:w-8" onClick={onMinimize} aria-label={zh ? '最小化' : 'Minimize'}>
                        <ChevronDown className="h-4 w-4" />
                    </Button>
                </div>
                <Progress className="h-1" value={snapshot.progress} aria-label={zh ? '总体上传进度' : 'Overall upload progress'} />
            </div>
            <div className="min-h-0 max-h-[300px] flex-1 overflow-x-hidden overflow-y-auto">
                {snapshot.tasks.map((task) => <TaskRow key={task.id} task={task} zh={zh} service={service} />)}
            </div>
            {(snapshot.completedCount > 0 || snapshot.tasks.some((task) =>
                task.status === 'CANCELLED' || (task.status === 'FAILED' && !task.retryable))) && (
                <div className="shrink-0 border-t px-2 py-1 text-right">
                    <Button variant="ghost" size="sm" className="h-11 lg:h-8" onClick={() => service.clearTerminal()}>
                        {zh ? '清除已完成' : 'Clear completed'}
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
    const { i18n } = useTranslation();
    const zh = i18n?.language?.startsWith('zh') ?? false;
    const { isMobile } = useResponsive();
    const [minimized, setMinimized] = useState(false);
    const [mobileOpen, setMobileOpen] = useState(false);

    if (!snapshot.initialized || snapshot.tasks.length === 0) return null;

    if (isMobile) {
        return (
            <>
                <Button
                    type="button"
                    onClick={() => setMobileOpen(true)}
                    className="fixed bottom-safe-bottom right-safe-right z-40 mb-20 mr-3 h-12 max-w-[calc(100vw-1.5rem)] gap-2 rounded-full px-4 shadow-lg"
                >
                    <UploadCloud className="h-4 w-4" />
                    <span>{snapshot.activeCount > 0 ? `${Math.round(snapshot.progress)}%` : zh ? '上传任务' : 'Uploads'}</span>
                    <ChevronUp className="h-4 w-4" />
                </Button>
                <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
                    <SheetContent side="bottom" className="flex max-h-[82dvh] min-h-[45dvh] flex-col gap-0 rounded-t-2xl p-0 pb-safe">
                        <SheetHeader className="sr-only"><SheetTitle>{zh ? '上传任务' : 'Uploads'}</SheetTitle></SheetHeader>
                        <TaskPanelContent zh={zh} service={service} snapshot={snapshot} onMinimize={() => setMobileOpen(false)} />
                    </SheetContent>
                </Sheet>
            </>
        );
    }

    if (minimized) {
        return (
            <Button
                type="button"
                onClick={() => setMinimized(false)}
                className="fixed bottom-safe-bottom right-safe-right z-40 mb-4 mr-4 h-11 gap-2 rounded-full px-4 shadow-lg"
            >
                <UploadCloud className="h-4 w-4" />
                <span>{snapshot.activeCount > 0 ? `${Math.round(snapshot.progress)}%` : zh ? '上传任务' : 'Uploads'}</span>
                <ChevronUp className="h-4 w-4" />
            </Button>
        );
    }

    return (
        <section className={cn(
            'fixed bottom-safe-bottom right-safe-right z-40 mb-3 mr-3 flex max-h-[420px] w-[360px] max-w-[calc(100vw-1.5rem)] flex-col overflow-hidden rounded-xl border bg-background shadow-2xl',
        )} aria-label={zh ? '上传任务' : 'Uploads'}>
            <TaskPanelContent zh={zh} service={service} snapshot={snapshot} onMinimize={() => setMinimized(true)} />
        </section>
    );
};
