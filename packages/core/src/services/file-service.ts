import { AppContext, FileService } from "@kn/common";
import { useContext } from "react";

// Re-export types from @kn/common for convenience
export type { FileService, UploadedFile, UploadOptions } from "@kn/common";

/**
 * Hook to access FileService from plugin services
 * @throws Error if FileService is not registered
 * @returns FileService instance
 */
export const useFileService = (): FileService => {
    const { pluginManager } = useContext(AppContext);
    const service = pluginManager?.pluginServices?.fileService;

    if (!service) {
        throw new Error(
            "useFileService: FileService is not registered. " +
            "Make sure plugin-file-manager is installed and loaded."
        );
    }

    return service;
};

/**
 * Hook to optionally access FileService (returns undefined if not available)
 * @returns FileService instance or undefined
 */
export const useOptionalFileService = (): FileService | undefined => {
    const { pluginManager } = useContext(AppContext);
    return pluginManager?.pluginServices?.fileService;
};

