import { useService } from "@kn/core";
import type { SpaceService } from "../types";

/**
 * Custom hook to access SpaceService with proper typing
 * @returns Typed SpaceService instance
 */
export const useSpaceService = (): SpaceService => {
    // @ts-ignore
    const spaceService = useService("spaceService") as SpaceService;
    return spaceService;
};
