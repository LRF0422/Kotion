import { useOptionalService, useService } from "../../hooks/use-service";
import type { SpacePageService } from "./operations";

export const useSpacePageService = (): SpacePageService => useService("spacePageService");

export const useOptionalSpacePageService = (): SpacePageService | undefined =>
    useOptionalService("spacePageService");
