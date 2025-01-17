import { ExtensionWrapper } from "@repo/common";
import { SubscriptStaticMenu } from "./menu";
import { Subscript } from "./subscript";

export * from "./subscript";
export * from "./menu";


export const SubscriptExtension: ExtensionWrapper = {
	name: Subscript.name,
	extendsion: Subscript,
	flotMenuConfig: [SubscriptStaticMenu]
}
