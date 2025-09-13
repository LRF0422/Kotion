export * from "./space-service"


import { SpaceService } from "./space-service";


declare module '@kn/common' {

    interface Services {
        spaceService: SpaceService
    }

}