import React, { useEffect } from 'react';
import { useUploadTaskService } from '@kn/common';
import { UploadTaskPanel } from './UploadTaskPanel';

export const UploadTaskHost: React.FC = () => {
    const service = useUploadTaskService();

    useEffect(() => {
        const resumeWaiting = () => {
            service.getSnapshot().tasks.forEach((task) => {
                if (task.status === 'CANCELLING') void service.cancel(task.id);
                else if (task.status === 'WAITING_FOR_NETWORK' || task.status === 'QUEUED') void service.resume(task.id);
            });
        };
        void service.initialize().then(() => {
            if (navigator.onLine) resumeWaiting();
        });
        window.addEventListener('online', resumeWaiting);
        return () => window.removeEventListener('online', resumeWaiting);
    }, [service]);

    return <UploadTaskPanel />;
};
