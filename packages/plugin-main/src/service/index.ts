export * from "./space-service"


import { SpaceService } from "./space-service";


declare module '@kn/common' {

    export interface Services {
        spaceService: SpaceService
    }

}