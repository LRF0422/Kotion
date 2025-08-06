import { ExtensionWrapper } from "@kn/common";
import { EventEmitter } from "./event";


export const EventExtension: ExtensionWrapper = {
    extendsion: [EventEmitter],
    name: EventEmitter.name
};