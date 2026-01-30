import React from "react";
import { createRoot, Root } from "react-dom/client";
import { FileSelectorOptions, SelectedFile } from "@kn/common";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@kn/ui";
import { FileManagerView } from "../editor-extensions/component/FileManager";
import { FileItem } from "../editor-extensions/component/FileContext";

interface FileSelectorState {
    open: boolean;
    options: FileSelectorOptions;
    resolve: ((files: SelectedFile[] | null) => void) | null;
}

/**
 * FileSelectorDialog component for rendering inside the service
 */
const FileSelectorDialogInner: React.FC<{
    state: FileSelectorState;
    onConfirm: (files: FileItem[]) => void;
    onCancel: () => void;
    onOpenChange: (open: boolean) => void;
}> = ({ state, onConfirm, onCancel, onOpenChange }) => {
    const { open, options } = state;
    const { multiple = false, target = 'file', title = 'Select Files' } = options;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-4xl h-[80vh] flex flex-col p-0 gap-0">
                <DialogHeader className="px-4 py-3 border-b">
                    <DialogTitle>{title}</DialogTitle>
                    <DialogDescription>
                        {multiple ? 'Select one or more files' : 'Select a file'}
                    </DialogDescription>
                </DialogHeader>
                <div className="flex-1 overflow-hidden">
                    <FileManagerView
                        className="h-full border-0 rounded-none"
                        selectable={true}
                        multiple={multiple}
                        target={target}
                        onConfirm={onConfirm}
                        onCancel={onCancel}
                    />
                </div>
            </DialogContent>
        </Dialog>
    );
};

/**
 * FileSelectorService - Singleton service for opening file selector dialog
 * This implementation does not use React Context
 */
class FileSelectorService {
    private container: HTMLDivElement | null = null;
    private root: Root | null = null;
    private state: FileSelectorState = {
        open: false,
        options: {},
        resolve: null,
    };

    /**
     * Initialize the service by creating a container element
     */
    private ensureContainer(): void {
        if (!this.container) {
            this.container = document.createElement("div");
            this.container.id = "file-selector-container";
            document.body.appendChild(this.container);
            this.root = createRoot(this.container);
        }
    }

    /**
     * Render the dialog with current state
     */
    private render(): void {
        if (!this.root) return;

        const handleConfirm = (files: FileItem[]) => {
            const selectedFiles: SelectedFile[] = files.map(file => ({
                id: file.id,
                name: file.name,
                path: file.path,
                isFolder: file.isFolder,
            }));

            if (this.state.resolve) {
                this.state.resolve(selectedFiles);
                this.state.resolve = null;
            }
            this.state.open = false;
            this.render();
        };

        const handleCancel = () => {
            if (this.state.resolve) {
                this.state.resolve(null);
                this.state.resolve = null;
            }
            this.state.open = false;
            this.render();
        };

        const handleOpenChange = (open: boolean) => {
            if (!open && this.state.resolve) {
                // User closed dialog without confirming
                this.state.resolve(null);
                this.state.resolve = null;
            }
            this.state.open = open;
            this.render();
        };

        this.root.render(
            <FileSelectorDialogInner
                state={{ ...this.state }}
                onConfirm={handleConfirm}
                onCancel={handleCancel}
                onOpenChange={handleOpenChange}
            />
        );
    }

    /**
     * Open file selector dialog
     * @param options - File selector options
     * @returns Promise that resolves with selected files or null if cancelled
     */
    openFileSelector(options?: FileSelectorOptions): Promise<SelectedFile[] | null> {
        this.ensureContainer();

        return new Promise((resolve) => {
            this.state = {
                open: true,
                options: options || {},
                resolve,
            };
            this.render();
        });
    }

    /**
     * Destroy the service and cleanup DOM
     */
    destroy(): void {
        if (this.state.resolve) {
            this.state.resolve(null);
            this.state.resolve = null;
        }

        if (this.root) {
            this.root.unmount();
            this.root = null;
        }

        if (this.container) {
            this.container.remove();
            this.container = null;
        }
    }
}

// Singleton instance
let fileSelectorServiceInstance: FileSelectorService | null = null;

/**
 * Get the FileSelectorService singleton instance
 */
export const getFileSelectorService = (): FileSelectorService => {
    if (!fileSelectorServiceInstance) {
        fileSelectorServiceInstance = new FileSelectorService();
    }
    return fileSelectorServiceInstance;
};

/**
 * Reset the FileSelectorService instance (useful for testing or cleanup)
 */
export const resetFileSelectorService = (): void => {
    if (fileSelectorServiceInstance) {
        fileSelectorServiceInstance.destroy();
        fileSelectorServiceInstance = null;
    }
};
