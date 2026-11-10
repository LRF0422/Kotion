import type { FileSelectorOptions, FileService, SelectedFile } from "../core/types";
import { useService, useOptionalService } from "../hooks/use-service";

/** @deprecated Import these contracts from the @kn/common root. */
export type { FileAccessUrls, FileService, UploadedFile, UploadOptions } from "../core/types";

/**
 * Host bridge for the in-app file selector.
 *
 * The `FileService` itself is owned by the host kernel (`@kn/core`), because
 * every plugin — and the shell — consumes it. The *dialog* that lets a user
 * pick a record from the file center is plugin UI (it needs the file manager's
 * tree, previews and editor context), so the host implementation delegates to
 * an implementation registered here by the file-manager plugin. Without the
 * plugin, `openFileSelector` reports "no selection" instead of breaking.
 */
export type FileSelectorImpl = (
    options?: FileSelectorOptions,
    editor?: unknown,
) => Promise<SelectedFile[] | null>;

let fileSelectorImpl: FileSelectorImpl | undefined;

/** Register (or clear, with `undefined`) the plugin-provided selector UI. */
export const setFileSelectorImpl = (impl?: FileSelectorImpl): void => {
    fileSelectorImpl = impl;
};

export const getFileSelectorImpl = (): FileSelectorImpl | undefined => fileSelectorImpl;

/**
 * Hook to access FileService from plugin services.
 * Uses the unified useService hook with proper type inference.
 * @throws Error if FileService is not registered
 * @returns FileService instance
 */
export const useFileService = (): FileService => {
    return useService("fileService");
};

/**
 * Hook to optionally access FileService (returns undefined if not available)
 * Uses the unified useOptionalService hook with proper type inference.
 * @returns FileService instance or undefined
 */
export const useOptionalFileService = (): FileService | undefined => {
    return useOptionalService("fileService");
};
