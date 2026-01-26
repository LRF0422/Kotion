import { useService } from "@kn/core";
import type { SpaceService } from "../types";

/**
 * Custom hook to access SpaceService with proper typing.
 * Uses the generic useService hook which provides automatic type inference.
 * 
 * @returns Typed SpaceService instance
 */
export const useSpaceService = (): SpaceService => {
    return useService("spaceService");
};
