import { FileService } from "../core/types";
import { useService, useOptionalService } from "../hooks/use-service";

// Re-export types from common for convenience
export type { FileService, UploadedFile, UploadOptions } from "../core/types";

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
