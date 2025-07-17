import { ExtensionWrapper } from "@kn/common";
import { Loading } from "./loading";

export * from "./loading";
export * from "./utilities";

export const LoadingExtension: ExtensionWrapper = {
    name: 'loading',
    extendsion: Loading
}
