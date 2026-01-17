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
            setError("Name cannot be empty");
            return;
        }

        if (trimmedName === file.name) {
            onOpenChange(false);
            return;
        }

        // Basic validation for file/folder names
        const invalidChars = /[<>:"/\\|?*]/;
        if (invalidChars.test(trimmedName)) {
            setError("Name contains invalid characters");
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
                        Rename {file.isFolder ? "Folder" : "File"}
                    </DialogTitle>
                    <DialogDescription>
                        Enter a new name for "{file.name}"
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="grid gap-2">
                        <Label htmlFor="name">New name</Label>
                        <Input
                            id="name"
                            value={newName}
                            onChange={(e) => {
                                setNewName(e.target.value);
                                setError(null);
                            }}
                            onKeyDown={handleKeyDown}
                            placeholder="Enter new name"
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
                        Cancel
                    </Button>
                    <Button onClick={handleConfirm}>
                        Rename
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
