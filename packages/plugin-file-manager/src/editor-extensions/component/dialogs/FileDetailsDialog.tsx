import React from "react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    Button,
    Separator,
    ScrollArea,
} from "@kn/ui";
import { FolderIcon, FileIcon, CalendarIcon, HardDriveIcon, MapPinIcon } from "@kn/icon";
import { FileItem } from "../FileContext";
import { formatFileSize } from "../../../utils/fileUtils";
import { useI18n } from "../../../i18n/use-i18n";

export interface FileDetailsDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    file: FileItem | null;
}

interface DetailRowProps {
    label: string;
    value: string | React.ReactNode;
    icon?: React.ReactNode;
    wrap?: boolean;
}

const DetailRow: React.FC<DetailRowProps> = ({ label, value, icon, wrap = false }) => (
    <div className="flex min-w-0 items-start gap-3 py-2">
        {icon && <div className="mt-0.5 shrink-0 text-muted-foreground">{icon}</div>}
        <div className="min-w-0 flex-1">
            <div className="text-sm text-muted-foreground">{label}</div>
            <div className={wrap
                ? "min-w-0 whitespace-normal text-sm font-medium [overflow-wrap:anywhere]"
                : "truncate text-sm font-medium"
            }>
                {value}
            </div>
        </div>
    </div>
);

export const FileDetailsDialog: React.FC<FileDetailsDialogProps> = ({
    open,
    onOpenChange,
    file,
}) => {
    const { t } = useI18n();

    if (!file) return null;

    const formatDate = (dateString?: string) => {
        if (!dateString) return t('details.unknown');
        try {
            return new Date(dateString).toLocaleString();
        } catch {
            return t('details.unknown');
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="flex max-h-[85vh] max-w-[calc(100vw-2rem)] flex-col overflow-hidden sm:max-w-[450px]">
                <DialogHeader className="shrink-0">
                    <DialogTitle className="flex min-w-0 items-center gap-2 pr-6">
                        {file.isFolder ? (
                            <FolderIcon className="h-5 w-5 shrink-0 text-yellow-500" />
                        ) : (
                            <FileIcon className="h-5 w-5 shrink-0 text-blue-500" />
                        )}
                        <span className="min-w-0 truncate" title={file.name}>{file.name}</span>
                    </DialogTitle>
                    <DialogDescription>
                        {file.isFolder ? t('details.propertiesFolder') : t('details.propertiesFile')}
                    </DialogDescription>
                </DialogHeader>

                <ScrollArea className="min-h-0 min-w-0 flex-1">
                    <div className="min-w-0 space-y-1 pr-3">
                        {/* Basic Info Section */}
                        <div className="min-w-0 space-y-1 rounded-lg bg-muted/50 p-4">
                            <h4 className="mb-2 text-sm font-semibold">{t('details.basicInfo')}</h4>

                            <DetailRow
                                label={t('details.name')}
                                value={file.name}
                            />

                            <DetailRow
                                label={t('details.type')}
                                value={file.isFolder ? t('details.folder') : t('details.file')}
                            />

                            {file.path && (
                                <DetailRow
                                    label={t('details.location')}
                                    value={file.path}
                                    icon={<MapPinIcon className="h-4 w-4" />}
                                    wrap
                                />
                            )}
                        </div>

                        <Separator />

                        {/* Size & Dates Section */}
                        <div className="min-w-0 space-y-1 rounded-lg bg-muted/50 p-4">
                            <h4 className="mb-2 text-sm font-semibold">{t('details.details')}</h4>

                            {!file.isFolder && file.size !== undefined && (
                                <DetailRow
                                    label={t('details.size')}
                                    value={formatFileSize(file.size)}
                                    icon={<HardDriveIcon className="h-4 w-4" />}
                                />
                            )}

                            <DetailRow
                                label={t('details.created')}
                                value={formatDate(file.createdAt)}
                                icon={<CalendarIcon className="h-4 w-4" />}
                            />

                            <DetailRow
                                label={t('details.modified')}
                                value={formatDate(file.updatedAt)}
                                icon={<CalendarIcon className="h-4 w-4" />}
                            />
                        </div>

                        {/* ID Section (for debugging/reference) */}
                        <div className="min-w-0 rounded-lg bg-muted/50 p-4">
                            <h4 className="mb-2 text-sm font-semibold">{t('details.technicalDetails')}</h4>
                            <DetailRow
                                label={t('details.id')}
                                value={
                                    <code className="block max-w-full break-all rounded bg-muted px-1 py-0.5 text-xs">
                                        {file.id}
                                    </code>
                                }
                                wrap
                            />
                        </div>
                    </div>
                </ScrollArea>

                <DialogFooter className="shrink-0 pt-4">
                    <Button
                        className="h-11 w-full sm:h-10 sm:w-auto"
                        onClick={() => onOpenChange(false)}
                    >
                        {t('details.close')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
