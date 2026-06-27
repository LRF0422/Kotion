import { Button } from "@kn/ui";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@kn/ui";
import { Input } from "@kn/ui";
import { Label } from "@kn/ui";
import React, { useState, useCallback, useEffect } from "react";
import { useI18n } from "../../../i18n/use-i18n";

export interface CreateFolderDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onCreate: (name: string) => void;
}

export const CreateFolderDialog: React.FC<CreateFolderDialogProps> = ({
    open,
    onOpenChange,
    onCreate,
}) => {
    const [folderName, setFolderName] = useState("");
    const [error, setError] = useState<string | null>(null);
    const { t } = useI18n();

    useEffect(() => {
        if (open) {
            setFolderName("");
            setError(null);
        }
    }, [open]);

    const handleCreate = useCallback(() => {
        const trimmedName = folderName.trim();

        if (!trimmedName) {
            setError(t('createFolder.emptyError'));
            return;
        }

        // Basic validation for folder names
        const invalidChars = /[<>:"/\\|?*]/;
        if (invalidChars.test(trimmedName)) {
            setError(t('createFolder.invalidError'));
            return;
        }

        onCreate(trimmedName);
        onOpenChange(false);
    }, [folderName, onCreate, onOpenChange]);

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === "Enter") {
            e.preventDefault();
            handleCreate();
        }
    }, [handleCreate]);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>{t('createFolder.title')}</DialogTitle>
                    <DialogDescription>
                        {t('createFolder.description')}
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="grid gap-2">
                        <Label htmlFor="folder-name">{t('createFolder.label')}</Label>
                        <Input
                            id="folder-name"
                            value={folderName}
                            onChange={(e) => {
                                setFolderName(e.target.value);
                                setError(null);
                            }}
                            onKeyDown={handleKeyDown}
                            placeholder={t('createFolder.placeholder')}
                            autoFocus
                            className={error ? "border-destructive" : ""}
                        />
                        {error && (
                            <p className="text-sm text-destructive">{error}</p>
                        )}
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        {t('createFolder.cancel')}
                    </Button>
                    <Button onClick={handleCreate}>
                        {t('createFolder.create')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};