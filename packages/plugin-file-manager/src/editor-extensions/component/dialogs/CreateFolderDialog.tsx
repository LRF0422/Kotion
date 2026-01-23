import { Button } from "@kn/ui";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@kn/ui";
import { Input } from "@kn/ui";
import { Label } from "@kn/ui";
import React, { useState, useCallback, useEffect } from "react";

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

    useEffect(() => {
        if (open) {
            setFolderName("");
            setError(null);
        }
    }, [open]);

    const handleCreate = useCallback(() => {
        const trimmedName = folderName.trim();

        if (!trimmedName) {
            setError("Folder name cannot be empty");
            return;
        }

        // Basic validation for folder names
        const invalidChars = /[<>:"/\\|?*]/;
        if (invalidChars.test(trimmedName)) {
            setError("Folder name contains invalid characters");
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
                    <DialogTitle>Create New Folder</DialogTitle>
                    <DialogDescription>
                        Enter a name for the new folder
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="grid gap-2">
                        <Label htmlFor="folder-name">Folder name</Label>
                        <Input
                            id="folder-name"
                            value={folderName}
                            onChange={(e) => {
                                setFolderName(e.target.value);
                                setError(null);
                            }}
                            onKeyDown={handleKeyDown}
                            placeholder="Enter folder name"
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
                    <Button onClick={handleCreate}>
                        Create
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};