import type { UploadTaskService } from "../core/types";
import { useOptionalService, useService } from "../hooks/use-service";

export const useUploadTaskService = (): UploadTaskService => useService("uploadTaskService");

export const useOptionalUploadTaskService = (): UploadTaskService | undefined =>
    useOptionalService("uploadTaskService");
