import React, { useState, useCallback, useEffect } from "react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    Button,
    Input,
    Label,
} from "@kn/ui";
import { FileItem } from "../FileContext";
import { useI18n } from "../../../i18n/use-i18n";

export interface RenameDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    file: FileItem | null;
    onConfirm: (file: FileItem, newName: string) => void;
}

export const RenameDialog: React.FC<RenameDialogProps> = ({
    open,
    onOpenChange,
    file,
    onConfirm,
}) => {
    const [newName, setNewName] = useState("");
    const [error, setError] = useState<string | null>(null);
    const { t } = useI18n();

    useEffect(() => {
        if (file && open) {
            setNewName(file.name);
            setError(null);
        }
    }, [file, open]);

    const handleConfirm = useCallback(() => {
        if (!file) return;

        const trimmedName = newName.trim();

        if (!trimmedName) {
            setError(t('rename.emptyError'));
            return;
        }

        if (trimmedName === file.name) {
            onOpenChange(false);
            return;
        }

        // Basic validation for file/folder names
        const invalidChars = /[<>:"/\\|?*]/;
        if (invalidChars.test(trimmedName)) {
            setError(t('rename.invalidError'));
            return;
        }

        onConfirm(file, trimmedName);
        onOpenChange(false);
    }, [file, newName, onConfirm, onOpenChange]);

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === "Enter") {
            e.preventDefault();
            handleConfirm();
        }
    }, [handleConfirm]);

    if (!file) return null;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>
                        {file.isFolder ? t('rename.titleFolder') : t('rename.titleFile')}
                    </DialogTitle>
                    <DialogDescription>
                        {t('rename.description', { name: file.name })}
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="grid gap-2">
                        <Label htmlFor="name">{t('rename.label')}</Label>
                        <Input
                            id="name"
                            value={newName}
                            onChange={(e) => {
                                setNewName(e.target.value);
                                setError(null);
                            }}
                            onKeyDown={handleKeyDown}
                            placeholder={t('rename.placeholder')}
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
                        {t('rename.cancel')}
                    </Button>
                    <Button onClick={handleConfirm}>
                        {t('rename.confirm')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
