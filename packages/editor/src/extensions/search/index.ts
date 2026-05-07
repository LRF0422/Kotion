import { ExtensionWrapper } from "@kn/common";
import { SearchNReplace } from "./search";
import { SearchStaticMenu } from "./menu";
import { SearchPanel } from "./panel";
import "./style.css";

export * from "./search";
export * from "./events";
export { SearchPanel } from "./panel";
export { SearchStaticMenu } from "./menu";

export const SearchExtension: ExtensionWrapper = {
    name: SearchNReplace.name,
    extendsion: SearchNReplace,
    menuConfig: {
        group: "custom",
        menu: SearchStaticMenu,
    },
    floatingUI: SearchPanel,
};
